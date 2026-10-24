import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { _electron } from 'playwright-core';
import { JSDOM } from 'jsdom';
import { abc2xml } from 'abc-utils';
import { LocalDocumentStore } from '../server/store.mjs';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(process.env.CHORALE_SCAN_ARTIFACTS || join(root, '.local/scan-trial'), new Date().toISOString().replace(/[:.]/g, '-'));
const home = join(artifacts, 'library');
await mkdir(artifacts, { recursive: true });
const port = await new Promise((done) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => done(value)); });
});
const melody = 'X:1\nT:Scan trial melody\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c | c B A G | F E D C |]';
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
const parse = (xml) => new dom.window.DOMParser().parseFromString(xml, 'text/xml');

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
  assert.ok(engine.available, engine.message);
  const abcjsCode = await readFile(join(root,'node_modules/abcjs/dist/abcjs-basic-min.js'),'utf8');

  const createFixture = async (name, abc) => {
    console.log(`Rendering ${name} fixture…`);
    const data = await application.evaluate(async ({ BrowserWindow }, { abc, code }) => {
      const window = new BrowserWindow({show:false,width:800,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
      try {
        await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><head><style>body{margin:30px;background:white}#music{width:700px}svg{max-width:100%}</style></head><body><div id="music"></div></body></html>'));
        await window.webContents.executeJavaScript(`${code}\n;void 0;`);
        const noteCount = await window.webContents.executeJavaScript(`(() => {
          const tunes=ABCJS.renderAbc('music', ${JSON.stringify(abc)}, {staffwidth:660,scale:1, paddingleft:15,paddingright:15});
          return tunes.reduce((sum,tune)=>sum+tune.lines.reduce((sum,line)=>sum+(line.staff||[]).reduce((sum,staff)=>sum+staff.voices.reduce((sum,voice)=>sum+voice.reduce((sum,event)=>sum+(event.pitches?.length||0),0),0),0),0),0);
        })()`);
        const pdf = await window.webContents.printToPDF({pageSize:'A4',printBackground:true,margins:{top:0.2,bottom:0.2,left:0.2,right:0.2}});
        window.setSize(2400,3000); window.webContents.setZoomFactor(3);
        await new Promise((done) => setTimeout(done, 200));
        const image = await window.webContents.capturePage();
        return {pdf:pdf.toString('base64'),png:image.toPNG().toString('base64'),noteCount};
      } finally { window.destroy(); }
    }, {abc,code:abcjsCode});
    assert.equal(data.noteCount, events(abc2xml(abc).xml).events.length, 'Rendered fixture must contain every reference note');
    await writeFile(join(artifacts,`${name}.pdf`),Buffer.from(data.pdf,'base64'));
    await writeFile(join(artifacts,`${name}.png`),Buffer.from(data.png,'base64'));
    await writeFile(join(artifacts,`${name}.abc`),abc);
  };
  await createFixture('melody',melody);
  await createFixture('bwv371',chorale);
  console.log(`Generated trial scores in ${artifacts}`);

  for (const [name,extension,abc] of [['melody','pdf',melody],['melody','png',melody],['bwv371','pdf',chorale]]) {
    const source = join(artifacts,`${name}.${extension}`);
    const before = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents);
    const previousJobs = new Set(await readdir(join(home,'imports')).catch(()=>[]));
    await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).click();
    await page.getByLabel('Sheet music file').setInputFiles(source);
    await page.getByRole('button',{name:'Scan selected pages',exact:true}).click();
    console.log(`Recognizing ${name}.${extension} with real Audiveris…`);
    await page.waitForFunction(()=>document.querySelector('.scan-modal [role="alert"]') || [...document.querySelectorAll('.scan-modal button')].some((button)=>button.textContent==='Import recognized score'),{},{timeout:200000});
    const failure = await page.locator('.scan-modal [role="alert"]').allTextContents();
    assert.deepEqual(failure,[],`${name}.${extension}: ${failure.join(' ')}`);
    const unaccepted = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents);
    assert.equal(unaccepted.length,before.length,'Review must not create a document');
    const [jobId] = (await readdir(join(home,'imports'))).filter((job)=>!previousJobs.has(job));
    assert.ok(jobId);
    const folder = join(home,'imports',jobId);
    const manifest = JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));
    const xml = await readFile(join(folder,'recognized.musicxml'),'utf8');
    assert.equal(manifest.status,'recognized');
    assert.ok(await page.getByAltText(/Scanned source page/).count(),'Original page preview should be available');
    assert.ok(await page.locator('.scan-notation svg').count(),'Recognized score preview should be rendered');
    await page.screenshot({path:join(artifacts,`${name}-${extension}-review.png`)});
    await page.getByRole('button',{name:'Import recognized score',exact:true}).click();
    let documents = [];
    const deadline = Date.now()+20000;
    while(Date.now()<deadline) {
      documents = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents);
      if(documents.length===before.length+1 && documents.some((document)=>document.abcSource.includes(jobId))) break;
      await new Promise((done)=>setTimeout(done,100));
    }
    assert.equal(documents.length,before.length+1,'Accepted score should persist');
    const imported = documents.find((document)=>document.abcSource.includes(jobId));
    assert.ok(imported);
    for (const document of before) assert.ok(documents.some((current)=>current.id===document.id && current.abcSource===document.abcSource),'Existing scores remain unchanged');
    await writeFile(join(artifacts,`${name}-${extension}-imported.abc`),imported.abcSource);
    const metrics = compare(abc2xml(abc).xml,xml);
    const conversion = compare(xml,abc2xml(imported.abcSource).xml);
    if (name==='melody') assert.equal(metrics.missingOrChanged,0,'Simple melody pitch/rhythm should match');
    if (name==='melody') assert.equal(metrics.extraOrChanged,0,'Simple melody should contain no extra notes');
    if (name==='melody') assert.equal(conversion.missingOrChanged,0,'MusicXML-to-ABC should preserve simple melody');
    results.push({source:`${name}.${extension}`,sha256:createHash('sha256').update(await readFile(source)).digest('hex'),jobId,elapsedMs:manifest.elapsedMs,omr:metrics,conversion,warnings:manifest.warnings});
    console.log(JSON.stringify(results.at(-1)));
    await page.reload();
    await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).waitFor();
    assert.ok(await page.evaluate(async(jobId)=> (await (await fetch('/v1/workspace')).json()).documents.some((document)=>document.abcSource.includes(jobId)),jobId),'Accepted score and provenance survive reload');
  }
  // Real cancellation should leave the document library untouched.
  const count = await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents.length);
  await page.getByRole('button',{name:'Scan PDF / PNG',exact:true}).click();
  await page.getByLabel('Sheet music file').setInputFiles(join(artifacts,'bwv371.pdf'));
  await page.getByRole('button',{name:'Scan selected pages',exact:true}).click();
  await page.getByRole('button',{name:'Cancel scan',exact:true}).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(async()=> (await (await fetch('/v1/workspace')).json()).documents.length),count);
  assert.deepEqual(errors,[]);
  await writeFile(join(artifacts,'results.json'),JSON.stringify({audiveris:'5.11.0',noSandbox:sandboxDisabled,results},null,2));
  const rows=results.map((item)=>`| ${item.source} | ${(item.elapsedMs/1000).toFixed(1)}s | ${item.omr.matchedEvents}/${item.omr.expectedNotes} | ${item.omr.extraOrChanged} | ${item.conversion.missingOrChanged} |`).join('\n');
  await writeFile(join(artifacts,'REPORT.md'),`# PDF/PNG import trial\n\nReal Audiveris 5.11.0, clean scores rendered from known ABC.\n\n| Input | Scan time | Matching pitch/onset/duration events | Extra or changed events | Events lost/changed in ABC conversion |\n|---|---:|---:|---:|---:|\n${rows}\n\nReview-before-import, source previews, explicit acceptance, preservation of existing documents, daemon persistence, reload and cancellation passed.\n\nMetrics pool voices and do not certify voice assignment, ties, text or engraving. These synthetic pages do not establish real-scan accuracy. Electron sandbox disabled by the automation launcher: ${sandboxDisabled}.\n`);
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
