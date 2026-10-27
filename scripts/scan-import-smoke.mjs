import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { _electron } from 'playwright-core';
import { JSDOM } from 'jsdom';
import { abc2xml } from 'abc-utils';
import { convertMusicXmlToAbc } from '@educandu/abc-tools';
import { LocalDocumentStore } from '../server/store.mjs';

const require = createRequire(import.meta.url);
const waitForAsync = async (check, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Timed out waiting for background import state.');
};
const root = resolve(import.meta.dirname, '..');
const engines = (process.env.CHORALE_SCAN_ENGINES || 'copisteria,audiveris').split(',');
assert.ok(engines.every((engine) => ['copisteria', 'audiveris'].includes(engine)));
const artifacts = resolve(process.env.CHORALE_SCAN_ARTIFACTS || join(root, '.local/scan-trial'), new Date().toISOString().replace(/[:.]/g, '-'));
const home = join(artifacts, 'library');
await mkdir(artifacts, { recursive: true });
const port = await new Promise((done) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => done(value)); });
});
const melody = 'X:1\nT:Scan trial melody\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c | c B A G | F E D C |]';
const melodyTwice = melody.replace('|]', '| C D E F | G A B c | c B A G | F E D C |]');
const fullChorale = await readFile(join(root, 'public/samples/bwv_371.abc'), 'utf8');
const choraleSections = fullChorale.split(/\nV:(\d+)\n/);
// A one-system excerpt keeps the whole known reference on one PDF page.
const choraleVoices = [];
for(let index=1;index<choraleSections.length;index+=2) {
  choraleVoices.push(`V:${choraleSections[index]}\n${choraleSections[index+1].split('$')[0].trim()}`);
}
const chorale = [choraleSections[0].trim(),...choraleVoices].join('\n');
const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
await store.create({ abcSource: melody.replace('Scan trial melody', 'Existing score'), title: 'Existing score' });
store.close();
const env = { ...process.env, CHORALE_HOME: home, CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: join(artifacts,'profile'), CHORALE_NODE_EXECUTABLE: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
const dom = new JSDOM('');
globalThis.window = dom.window;
const parse = (xml) => new dom.window.DOMParser().parseFromString(xml, 'text/xml');

const xmlExcerpt = async (file, bars) => {
  const document = parse(await readFile(file, 'utf8'));
  for (const part of document.querySelectorAll('score-partwise > part')) {
    [...part.querySelectorAll(':scope > measure')].slice(bars).forEach((measure) => measure.remove());
  }
  const xml = new dom.window.XMLSerializer().serializeToString(document);
  const converted = convertMusicXmlToAbc(xml);
  return typeof converted === 'string' ? converted : converted.result;
};
const bwv269 = await xmlExcerpt(join(root, 'test/fixtures/score-scan/bwv269.musicxml'), 5);
const furElise = await xmlExcerpt(join(root, 'public/samples/fur_elise.xml'), 8);
const moonlight = await xmlExcerpt(join(root, 'public/samples/moonlight_sonata.xml'), 4);

// Compare sounding pitch/onset/duration by written measure. Pooling voices lets
// this measure musical-content loss independently of part/staff renumbering.
// This metric does not establish correct voice assignment or engraving.
function events(xml) {
  const document = parse(xml);
  assert.equal(document.querySelectorAll('parsererror').length, 0);
  const result = [];
  const voices = new Set();
  [...document.querySelectorAll('score-partwise > part')].forEach((part, partIndex) => {
    let divisions = 1;
    [...part.querySelectorAll(':scope > measure')].forEach((measure, measureIndex) => {
      let cursor = 0; let chordOnset = 0;
      for (const child of measure.children) {
        if (child.tagName === 'attributes') divisions = Number(child.querySelector('divisions')?.textContent || divisions);
        const duration = Number(child.querySelector('duration')?.textContent || 0) / divisions;
        if (child.tagName === 'backup') cursor -= duration;
        if (child.tagName === 'forward') cursor += duration;
        if (child.tagName !== 'note') continue;
        const onset = child.querySelector('chord') ? chordOnset : cursor;
        if (!child.querySelector('chord')) { chordOnset = cursor; cursor += duration; }
        const pitch = child.querySelector('pitch');
        if (!pitch) continue;
        voices.add(`${partIndex}:${child.querySelector('voice')?.textContent || '1'}`);
        const step = {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[pitch.querySelector('step').textContent];
        const midi = (Number(pitch.querySelector('octave').textContent)+1)*12+step+Number(pitch.querySelector('alter')?.textContent||0);
        const rounded = (number) => Math.round(number*10000)/10000;
        result.push([measureIndex, rounded(onset), midi, rounded(duration)].join(':'));
      }
    });
  });
  return { events: result.sort(), voices: voices.size };
}
function compare(referenceXml, actualXml) {
  const reference = events(referenceXml); const actual = events(actualXml);
  const remaining = [...actual.events]; let matched = 0;
  for (const event of reference.events) { const index = remaining.indexOf(event); if (index !== -1) { matched++; remaining.splice(index,1); } }
  return { expectedNotes:reference.events.length, actualNotes:actual.events.length, matchedEvents:matched, missingOrChanged:reference.events.length-matched, extraOrChanged:remaining.length, referenceVoices:reference.voices, actualVoices:actual.voices };
}

let application;
const results = [];
const errors = [];
let sandboxDisabled = false;
try {
  // Electron's Wayland compositor cannot capture this hidden offscreen fixture.
  // Use X11 for the Linux test; the application's normal launch is unaffected.
  application = await _electron.launch({ executablePath:require('electron'),args:[...(process.platform==='linux'?['--ozone-platform=x11']:[]),...(process.env.CHORALE_SMOKE_NO_SANDBOX==='1'?['--no-sandbox']:[]),join(root,'dist-electron/main.js')],cwd:root,env,timeout:30000 });
  sandboxDisabled = application.process().spawnargs.includes('--no-sandbox');
  const page = await application.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror',(error)=>errors.push(error.message));
  await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).waitFor();
  const engine = await page.evaluate(()=>window.choraleScan.status());
  for (const selected of engines) assert.ok(engine.engines.find((item) => item.id === selected)?.available, `${selected}: install this engine before the comparison smoke.`);
  const abcjsCode = await readFile(join(root,'node_modules/abcjs/dist/abcjs-basic-min.js'),'utf8');

  const createFixture = async (name, abc, secondPage = false, reference = abc) => {
    console.log(`Rendering ${name} fixture…`);
    const data = await application.evaluate(async ({ BrowserWindow }, { abc, code, secondPage }) => {
      const window = new BrowserWindow({show:false,width:800,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
      try {
        await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><head><style>body{margin:30px;background:white}#music{width:700px}svg{max-width:100%}</style></head><body><div id="music"></div>' + (secondPage ? '<div id="music2" style="break-before:page"></div>' : '') + '</body></html>'));
        await window.webContents.executeJavaScript(`${code}\n;void 0;`);
        const noteCount = await window.webContents.executeJavaScript(`(() => {
          const tunes=ABCJS.renderAbc('music', ${JSON.stringify(abc)}, {staffwidth:660,scale:1, paddingleft:15,paddingright:15});
          if (${JSON.stringify(secondPage)}) tunes.push(...ABCJS.renderAbc('music2', ${JSON.stringify(abc)}, {staffwidth:660,scale:1,paddingleft:15,paddingright:15}));
          return tunes.reduce((sum,tune)=>sum+tune.lines.reduce((sum,line)=>sum+(line.staff||[]).reduce((sum,staff)=>sum+staff.voices.reduce((sum,voice)=>sum+voice.reduce((sum,event)=>sum+(event.pitches?.length||0),0),0),0),0),0);
        })()`);
        const pdf = await window.webContents.printToPDF({pageSize:'A4',printBackground:true,margins:{top:0.2,bottom:0.2,left:0.2,right:0.2}});
        window.setSize(2400,3000); window.webContents.setZoomFactor(3);
        await new Promise((done) => setTimeout(done, 200));
        const image = await window.webContents.capturePage();
        return {pdf:pdf.toString('base64'),png:image.toPNG().toString('base64'),noteCount};
      } finally { window.destroy(); }
    }, {abc,code:abcjsCode,secondPage});
    assert.equal(data.noteCount, events(abc2xml(reference).xml).events.length, 'Rendered fixture must contain every reference note');
    await writeFile(join(artifacts,`${name}.pdf`),Buffer.from(data.pdf,'base64'));
    await writeFile(join(artifacts,`${name}.png`),Buffer.from(data.png,'base64'));
    await writeFile(join(artifacts,`${name}.abc`),abc);
  };
  await createFixture('melody',melody);
  await createFixture('bwv371',chorale);
  await createFixture('bwv269', bwv269);
  await createFixture('fur-elise', furElise);
  await createFixture('moonlight', moonlight);
  await createFixture('melody-two-pages', melody, true, melodyTwice);
  console.log(`Generated trial scores in ${artifacts}`);

  for (const selectedEngine of engines) for (const [name,extension,abc] of [['melody','pdf',melody],['melody','png',melody],['bwv371','pdf',chorale],['bwv269','pdf',bwv269],['fur-elise','pdf',furElise],['moonlight','pdf',moonlight],['melody-two-pages','pdf',melodyTwice]]) {
    if (process.env.CHORALE_SCAN_CASES && !process.env.CHORALE_SCAN_CASES.split(',').includes(name)) continue;
    const source = join(artifacts,`${name}.${extension}`);
    const before = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents);
    const previousJobs = new Set(await readdir(join(home,'imports')).catch(()=>[]));
    await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).click();
    await page.getByLabel('Recognition engine').selectOption(selectedEngine);
    await page.getByLabel('Sheet music file').setInputFiles(source);
    await page.getByRole('button',{name:'Import',exact:true}).click();
    console.log(`Recognizing ${name}.${extension} with real ${selectedEngine}…`);
    await page.getByRole('dialog', { name: 'Import sheet music' }).waitFor({ state: 'hidden' });
    const [jobId] = (await readdir(join(home,'imports'))).filter((job)=>!previousJobs.has(job));
    assert.ok(jobId);
    await waitForAsync(() => page.evaluate(async (id) => {
      const jobs = await window.choraleScan.listJobs();
      const documents = (await (await fetch('/v1/workspace')).json()).documents;
      return documents.some((document) => document.id === id) || jobs.some((job) => job.id === id && ['failed', 'cancelled'].includes(job.state));
    }, jobId), 650000);
    const failure = await page.locator('.background-import-stage [role="alert"]').allTextContents();
    if (failure.length && selectedEngine === 'audiveris' && !name.startsWith('melody')) {
      results.push({ engine: selectedEngine, source: `${name}.${extension}`, error: failure.join(' ') });
      await writeFile(join(artifacts,'partial-results.json'), JSON.stringify(results, null, 2));
      await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
      continue;
    }
    assert.deepEqual(failure,[],`${name}.${extension}: ${failure.join(' ')}`);
    const folder = join(home,'imports',jobId);
    const manifest = JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));
    const xml = await readFile(join(folder,'recognized.musicxml'),'utf8');
    assert.equal(manifest.status,'recognized');
    assert.equal(manifest.engine, selectedEngine);
    if (name === 'melody-two-pages') {
      assert.deepEqual(manifest.pages, [1, 2]);
      if (selectedEngine === 'copisteria') assert.deepEqual(manifest.pageMeasures, [{page:1,firstMeasure:1,lastMeasure:4},{page:2,firstMeasure:5,lastMeasure:8}]);
    }
    await page.screenshot({path:join(artifacts,`${selectedEngine}-${name}-${extension}-imported.png`)});
    let documents = [];
    const deadline = Date.now()+20000;
    while(Date.now()<deadline) {
      documents = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents);
      if(documents.length===before.length+1 && documents.some((document)=>document.abcSource.includes(jobId))) break;
      await new Promise((done)=>setTimeout(done,100));
    }
    assert.equal(documents.length,before.length+1,'Imported score should persist');
    const imported = documents.find((document)=>document.abcSource.includes(jobId));
    assert.ok(imported);
    for (const document of before) assert.ok(documents.some((current)=>current.id===document.id && current.abcSource===document.abcSource),'Existing scores remain unchanged');
    await writeFile(join(artifacts,`${selectedEngine}-${name}-${extension}-imported.abc`),imported.abcSource);
    const metrics = compare(abc2xml(abc).xml,xml);
    const conversion = compare(xml,abc2xml(imported.abcSource).xml);
    if (name.startsWith('melody')) assert.equal(metrics.missingOrChanged,0,'Simple melody pitch/rhythm should match');
    if (name.startsWith('melody')) assert.equal(metrics.extraOrChanged,0,'Simple melody should contain no extra notes');
    if (name.startsWith('melody')) assert.equal(conversion.missingOrChanged,0,'MusicXML-to-ABC should preserve simple melody');
    results.push({engine:selectedEngine,source:`${name}.${extension}`,sha256:createHash('sha256').update(await readFile(source)).digest('hex'),jobId,elapsedMs:manifest.elapsedMs,omr:metrics,conversion,warnings:manifest.warnings});
    console.log(JSON.stringify(results.at(-1)));
    await writeFile(join(artifacts,'partial-results.json'), JSON.stringify(results, null, 2));
    await page.reload();
    await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).waitFor();
    assert.ok(await page.evaluate(async(jobId)=> (await (await fetch('/v1/workspace')).json()).documents.some((document)=>document.abcSource.includes(jobId)),jobId),'Imported score and provenance survive reload');
  }
  if (process.env.CHORALE_SCAN_EXTERNAL_SOURCE) for (const selectedEngine of engines) {
    const source = resolve(process.env.CHORALE_SCAN_EXTERNAL_SOURCE);
    const before = await page.evaluate(async () => (await (await fetch('/v1/workspace')).json()).documents);
    const oldJobs = new Set(await readdir(join(home, 'imports')).catch(() => []));
    await page.getByRole('button', { name: 'Scan PDF / PNG', exact: true }).click();
    await page.getByLabel('Recognition engine').selectOption(selectedEngine);
    await page.getByLabel('Sheet music file').setInputFiles(source);
    await page.getByLabel('Pages to scan').fill(process.env.CHORALE_SCAN_EXTERNAL_PAGES || '1');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    console.log(`Recognizing external scan with ${selectedEngine}…`);
    await page.getByRole('dialog', { name: 'Import sheet music' }).waitFor({ state: 'hidden' });
    const [jobId] = (await readdir(join(home, 'imports'))).filter((job) => !oldJobs.has(job));
    await waitForAsync(() => page.evaluate(async (id) => {
      const jobs = await window.choraleScan.listJobs();
      const documents = (await (await fetch('/v1/workspace')).json()).documents;
      return documents.some((document) => document.id === id) || jobs.some((job) => job.id === id && ['failed', 'cancelled'].includes(job.state));
    }, jobId), 650000);
    const failure = await page.locator('.background-import-stage [role="alert"]').allTextContents();
    const folder = join(home, 'imports', jobId);
    const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
    const xml = await readFile(join(folder, 'recognized.musicxml'), 'utf8');
    if (process.env.CHORALE_SCAN_EXTERNAL_EXPECT_REJECTION === '1') {
      assert.ok(failure.length, 'Expected the known incompatible conversion to be rejected');
      assert.equal(await page.getByRole('button', { name: 'Remove entry', exact: true }).count(), 1);
      assert.ok(await page.getByRole('button', { name: 'Open source folder', exact: true }).isEnabled());
      assert.deepEqual(await page.evaluate(async () => (await (await fetch('/v1/workspace')).json()).documents), before);
      assert.equal(manifest.status, 'recognized', 'Recognition artifacts survive failed conversion');
      assert.ok(xml.includes('<pitch>'));
      await page.screenshot({ path: join(artifacts, `${selectedEngine}-external-rejection.png`) });
      results.push({ external: true, engine: selectedEngine, source, pages: manifest.pages, jobId, error: failure.join(' '), stage: 'conversion', recognizedNotes: events(xml).events.length });
      await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
      await page.getByRole('button', { name: 'Scan PDF / PNG', exact: true }).click();
      await page.getByLabel('Sheet music file').setInputFiles(join(artifacts, 'melody.pdf'));
      await page.waitForFunction(() => [...document.querySelectorAll('.scan-modal button')].some((button) => button.textContent === 'Import' && !button.disabled));
      assert.ok(await page.getByRole('button', { name: 'Import', exact: true }).isEnabled());
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      continue;
    }
    assert.deepEqual(failure, []);
    await page.screenshot({ path: join(artifacts, `${selectedEngine}-external-imported.png`) });
    await waitForAsync(() => page.evaluate(async (jobId) => (await (await fetch('/v1/workspace')).json()).documents.some((document) => document.abcSource.includes(jobId)), jobId));
    const documents = await page.evaluate(async () => (await (await fetch('/v1/workspace')).json()).documents);
    const imported = documents.find((document) => document.abcSource.includes(jobId));
    assert.equal(documents.length, before.length + 1);
    for (const previous of before) assert.ok(documents.some((document) => document.id === previous.id && document.abcSource === previous.abcSource));
    results.push({ external: true, engine: selectedEngine, source, pages: manifest.pages, jobId, elapsedMs: manifest.elapsedMs, recognizedNotes: events(xml).events.length, conversion: compare(xml, abc2xml(imported.abcSource).xml), warnings: manifest.warnings });
    await writeFile(join(artifacts, 'partial-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.at(-1)));
  }
  // Real cancellation should leave the document library untouched.
  const count = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents.length);
  await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).click();
  await page.getByLabel('Recognition engine').selectOption(engines[0]);
  await page.getByLabel('Sheet music file').setInputFiles(join(artifacts,'bwv371.pdf'));
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await page.getByRole('button',{name:'Cancel import',exact:true}).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents.length),count);
  assert.deepEqual(errors,[]);
  await writeFile(join(artifacts,'results.json'),JSON.stringify({engines,noSandbox:sandboxDisabled,results},null,2));
  const rows=results.map((item)=>item.error ? `| ${item.engine} | ${item.source} | Rejected safely: ${item.error.replaceAll('|','/')} | — | — | — |` : item.external ? `| ${item.engine} | External scan (pages ${item.pages.join(', ')}) | ${(item.elapsedMs/1000).toFixed(1)}s | ${item.recognizedNotes} recognized; reference unscored | — | ${item.conversion.missingOrChanged} |` : `| ${item.engine} | ${item.source} | ${(item.elapsedMs/1000).toFixed(1)}s | ${item.omr.matchedEvents}/${item.omr.expectedNotes} | ${item.omr.extraOrChanged} | ${item.conversion.missingOrChanged} |`).join('\n');
  await writeFile(join(artifacts,'REPORT.md'),`# PDF/PNG import trial\n\nReal Copisteria and/or Audiveris, clean scores rendered from known ABC. See results.json for the engines exercised.\n\n| Engine | Input | Scan time | Matching pitch/onset/duration events | Extra or changed events | Events lost/changed in ABC conversion |\n|---|---|---:|---:|---:|---:|\n${rows}\n\nBackground import, automatic validated creation, preservation of existing documents, daemon persistence, reload and cancellation passed.\n\nMetrics pool voices and do not certify voice assignment, ties, text or engraving. These synthetic pages do not establish real-scan accuracy. Electron sandbox disabled by the automation launcher: ${sandboxDisabled}.\n`);
  console.log(`Scan import smoke passed. Report: ${join(artifacts,'REPORT.md')}`);
} catch(error) {
  await writeFile(join(artifacts,'failure.txt'),String(error.stack||error));
  throw error;
} finally {
  if(application) {
    const timer=setTimeout(()=>application.process().kill('SIGKILL'),5000);
    try { await Promise.race([application.close(),new Promise((done)=>setTimeout(done,5500))]); } finally { clearTimeout(timer); }
  }
  try { const runtime=JSON.parse(await readFile(join(home,'runtime.json'),'utf8')); process.kill(runtime.pid,'SIGTERM'); } catch { /* No daemon was started. */ }
  dom.window.close();
}
