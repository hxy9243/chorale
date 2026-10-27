// Controlled recognizer fixture: verifies native queue, persistence and UI, not OMR quality.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright-core';
import { abc2xml } from 'abc-utils';
import { LocalDocumentStore } from '../server/store.mjs';

const waitForAsync = async (check, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Timed out waiting for background import state.');
};
const root = resolve(import.meta.dirname, '..');
const artifacts = join(root, '.local/background-scan-review', new Date().toISOString().replace(/[:.]/g, '-'));
const home = join(artifacts, 'library');
const fakeHome = join(artifacts, 'controlled-engine');
await mkdir(join(fakeHome, '.venv/bin'), { recursive: true });
await mkdir(join(fakeHome, 'models/small'), { recursive: true });
await writeFile(join(fakeHome, 'package.json'), JSON.stringify({ type: 'commonjs' }));
await writeFile(join(fakeHome, 'models/evidence-2m.pt'), 'controlled fixture');
await writeFile(join(fakeHome, 'models/small/v7_obj-recall-30m_best.pt'), 'controlled fixture');
await writeFile(join(fakeHome, 'install.json'), JSON.stringify({ revision: 'controlled-ui-fixture', models: ['fixture'] }));
const abc = 'X:1\nT:Title\nM:4/4\nL:1/4\nK:C\nC D E F|G A B c|]';
const xml = abc2xml(abc).xml;
await writeFile(join(fakeHome, '.venv/bin/python'), `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),folder=args[args.indexOf('--folder')+1];
const job=JSON.parse(fs.readFileSync(path.join(folder,'background-job.json')));
fs.writeFileSync(path.join(folder,'fixture-started'),job.sourceName);
const timer=setInterval(()=>{
 if(!fs.existsSync(path.join(folder,'fixture-release')))return;
 clearInterval(timer);
 if(job.sourceName.startsWith('Failed')){console.error('Controlled fixture failure');process.exit(1);}
 fs.writeFileSync(path.join(folder,'recognized.musicxml'),${JSON.stringify(xml)});
 fs.mkdirSync(path.join(folder,'pages'));
 for(const page of job.pages)fs.writeFileSync(path.join(folder,'pages','page-'+String(page).padStart(6,'0')+'.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jbc8AAAAASUVORK5CYII=','base64'));
 fs.writeFileSync(path.join(folder,'copisteria.json'),JSON.stringify({pageMeasures:job.pages.map(page=>({page,firstMeasure:1,lastMeasure:2}))}));
},50);
`, { mode: 0o755 });
const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
const existing = await store.create({ abcSource: abc.replace('T:Title', 'T:Existing score'), title: 'Existing score' });
store.close();
const port = await new Promise((done) => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => done(port)); }); });
const env = { ...process.env, CHORALE_HOME: home, CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: join(artifacts, 'profile'), CHORALE_NODE_EXECUTABLE: process.execPath, CHORALE_COPISTERIA_HOME: fakeHome };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [];
try {
  app = await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []), join(root, 'dist-electron/main.js')], cwd: root, env, timeout: 30000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000); page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Scan PDF / PNG', exact: true }).waitFor();
  // Seven actual PDF pages exercise PDF.js defaults and the >5 notice.
  const pdf = await app.evaluate(async ({ BrowserWindow }) => {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await window.loadURL('data:text/html,' + encodeURIComponent('<style>section{height:800px;break-after:page}section:last-child{break-after:auto}</style>' + Array.from({ length: 7 }, (_, i) => `<section><h1>Score page ${i + 1}</h1></section>`).join('')));
      return (await window.webContents.printToPDF({ pageSize: 'A4' })).toString('base64');
    } finally { window.destroy(); }
  });
  const queue = async (name, expectedPages = '1-7') => {
    const file = join(artifacts, name); await writeFile(file, Buffer.from(pdf, 'base64'));
    const previous = await page.evaluate(() => window.choraleScan.listJobs());
    await page.getByRole('button', { name: 'Scan PDF / PNG', exact: true }).click();
    await page.getByLabel('Sheet music file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('input[placeholder="All pages"]')?.value === '1-7');
    assert.equal(await page.getByLabel('Pages to scan').inputValue(), expectedPages);
    assert.equal(await page.getByRole('note').count(), 1);
    const color = await page.getByRole('note').evaluate((element) => getComputedStyle(element).color);
    const [red, green, blue] = color.match(/\d+/g).map(Number);
    assert.ok(red > green * 1.5 && red > blue * 1.5, 'The notice must be visibly red');
    await page.screenshot({ path: join(artifacts, 'all-pages-notice.png') });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('dialog', { name: 'Import sheet music' }).waitFor({ state: 'hidden' });
    const jobs = await page.evaluate(() => window.choraleScan.listJobs());
    const job = jobs.find((job) => !previous.some((old) => old.id === job.id)); assert.ok(job);
    assert.deepEqual(job.pages, [1, 2, 3, 4, 5, 6, 7]);
    await page.locator(`[data-import-id="${job.id}"]`).waitFor();
    assert.match(await page.locator(`[data-import-id="${job.id}"]`).innerText(), /\(importing\.\.\.\)/);
    await page.getByRole('main', { name: 'Background score import' }).waitFor();
    assert.equal(await page.getByText('This score is still being imported in the background.').count(), 1);
    console.log(`Queued ${name} as ${job.id}`);
    return job;
  };
  const first = await queue('Piano study.pdf');
  const label = page.locator(`[data-import-id="${first.id}"] .scan-importing-label`);
  assert.equal(await label.evaluate((element) => getComputedStyle(element).animationName), 'scan-import-pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await label.evaluate((element) => getComputedStyle(element).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.screenshot({ path: join(artifacts, 'importing-stage.png') });
  const queued = await queue('Cancelled chorale.pdf');
  assert.equal((await page.evaluate(() => window.choraleScan.listJobs())).find((job) => job.id === queued.id).state, 'queued');
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await page.getByText('Import cancelled. Your original file is preserved.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
  await page.locator(`[data-import-id="${queued.id}"]`).waitFor({ state: 'hidden' });
  assert.equal((await page.evaluate(() => window.choraleScan.listJobs())).find((job) => job.id === first.id).state, 'importing');
  await page.locator(`[data-import-id="${first.id}"] button`).click();
  await page.reload();
  await page.getByRole('main', { name: 'Background score import' }).waitFor();
  // Continue editing another score while native recognition is pending.
  await page.getByRole('button', { name: 'Open Existing score', exact: true }).click();
  await page.getByRole('main', { name: 'Background score import' }).waitFor({ state: 'hidden' });
  const before = await page.evaluate(async () => (await (await fetch('/v1/workspace')).json()).documents);
  assert.equal(before.length, 1);
  await writeFile(join(home, 'imports', first.id, 'fixture-release'), 'release');
  await waitForAsync(() => page.evaluate(async (id) => (await (await fetch('/v1/workspace')).json()).documents.some((document) => document.id === id), first.id));
  const after = await page.evaluate(async () => (await (await fetch('/v1/workspace')).json()).documents);
  assert.equal(after.length, 2);
  assert.equal(after.find((document) => document.id === existing.id).abcSource, before[0].abcSource);
  assert.equal(await page.getByRole('button', { name: 'Open Existing score', exact: true }).getAttribute('aria-current'), 'page', 'Completion must not steal focus');
  await waitForAsync(() => page.evaluate(async (id) => !(await window.choraleScan.listJobs()).some((job) => job.id === id), first.id));
  await page.getByRole('button', { name: 'Open Piano study', exact: true }).click();
  assert.ok(await page.locator('.abcjs-note').count());
  const notice = await page.locator('.scan-completed-notice').boundingBox();
  const zoom = await page.getByRole('group', { name: 'Score display options' }).boundingBox();
  assert.ok(notice.y >= zoom.y + zoom.height, 'The scan notice must not overlap the zoom controls');
  await page.screenshot({ path: join(artifacts, 'completed-score.png') });
  const failed = await queue('Failed scan.pdf');
  await writeFile(join(home, 'imports', failed.id, 'fixture-release'), 'release');
  await page.getByRole('button', { name: 'Remove entry', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open source folder', exact: true }).count(), 1);
  await page.screenshot({ path: join(artifacts, 'failed-stage.png') });
  assert.equal((await page.evaluate(async () => (await (await fetch('/v1/workspace')).json()).documents)).length, 2);
  await page.reload();
  await page.getByRole('button', { name: 'Remove entry', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
  await access(join(home, 'imports', failed.id, 'source.pdf'));
  assert.deepEqual(errors, []);
  const evidence = { type: 'controlled-engine desktop UX', checks: ['all seven pages selected', 'red time notice', 'immediate popup close', 'animated list entry', 'selected background stage', 'reduced motion', 'serialized queue', 'queued cancellation', 'renderer reload reattachment', 'completion without focus theft', 'stable document ID', 'save before job acknowledgement', 'preserved originals', 'failure recovery'], noSandbox: app.process().spawnargs.includes('--no-sandbox'), errors };
  await writeFile(join(artifacts, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(`Background import smoke passed: ${artifacts}`);
} catch (error) {
  await writeFile(join(artifacts, 'failure.txt'), String(error.stack || error)); throw error;
} finally {
  if (app) { const timer = setTimeout(() => app.process().kill('SIGKILL'), 5000); try { await Promise.race([app.close(), new Promise((done) => setTimeout(done, 5500))]); } finally { clearTimeout(timer); } }
  try { process.kill(JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')).pid, 'SIGTERM'); } catch { /* No daemon. */ }
}
