import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright-core';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const artifacts = join(root, '.local/page-inspection', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(artifacts, { recursive: true });
const home = join(artifacts, 'library');
const port = await new Promise((done) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => done(value)); });
});
const env = { ...process.env, CHORALE_HOME: home, CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: join(artifacts, 'profile'), CHORALE_NODE_EXECUTABLE: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const results = [];
try {
  application = await _electron.launch({ executablePath: require('electron'), args: [join(root, 'dist-electron/main.js')], cwd: root, env, timeout: 30000 });
  const page = await application.firstWindow();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'warning' || message.type() === 'error') console.log('Browser:', message.text()); });
  const inspect = async (source) => {
    await page.getByRole('button', { name: 'Scan PDF / PNG', exact: true }).click();
    await page.getByLabel('Sheet music file').setInputFiles(source);
    await page.getByText('Checking pages for music…', { exact: true }).waitFor({ state: 'hidden' });
    const cards = await page.locator('.scan-page-card').evaluateAll((cards) => cards.map((card) => ({
      page: Number(card.querySelector('input').getAttribute('aria-label').split(' ').at(-1)),
      kind: card.querySelector('small').textContent,
      selected: card.querySelector('input').checked,
      thumbnail: Boolean(card.querySelector('img')?.naturalWidth),
    })));
    await page.screenshot({ path: join(artifacts, `inspection-${results.length}.png`) });
    const warnings = await page.locator('.scan-warning').allTextContents();
    results.push({ source, cards, warnings });
    console.log(JSON.stringify(results.at(-1)));
    return cards;
  };
  // Generate a cover, prose page, blank page, music page and back matter.
  const code = await readFile(join(root, 'node_modules/abcjs/dist/abcjs-basic-min.js'), 'utf8');
  const pdf = await application.evaluate(async ({ BrowserWindow }, code) => {
    const window = new BrowserWindow({ show: false, width: 800, height: 1100, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
    try {
      const prose = 'This edition contains editorial commentary about the composer and the historical context. '.repeat(45);
      const html = `<html><head><style>body{margin:0;background:white;font-family:serif}section{height:900px;box-sizing:border-box;padding:30px;break-after:page}section:last-child{break-after:auto}h1{text-align:center;margin-top:180px}#music{width:680px}</style></head><body><section><h1>Collected piano music</h1><p style="text-align:center">A cover without musical notation</p></section><section><h2>Editorial preface</h2><p>${prose}</p></section><section></section><section><div id="music"></div></section><section><h2>Publication information</h2><p>${prose}</p></section></body></html>`;
      await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      await window.webContents.executeJavaScript(code + '\n;void 0;');
      await window.webContents.executeJavaScript(`ABCJS.renderAbc('music', 'X:1\\nT:Page selection melody\\nM:4/4\\nL:1/4\\nK:C\\nC D E F | G A B c | c B A G | F E D C |]', {staffwidth:650});void 0;`);
      return (await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 } })).toString('base64');
    } finally { window.destroy(); }
  }, code);
  const fixture = join(artifacts, 'mixed-pages.pdf');
  await writeFile(fixture, Buffer.from(pdf, 'base64'));
  const cards = await inspect(fixture);
  assert.equal(cards.length, 5, 'Fixture must contain five pages');
  assert.deepEqual(cards.filter((card) => card.selected).map((card) => card.page), [4]);
  assert.ok(cards.every((card) => card.thumbnail), 'Every page has a rendered thumbnail');
  await page.screenshot({ path: join(artifacts, 'mixed-pages-selection.png') });
  // Explicit override can include a page without staves and then omit it again.
  await page.getByLabel('Include page 1', { exact: true }).check();
  assert.equal(await page.getByLabel('Pages to scan').inputValue(), '1, 4');
  await page.getByLabel('Include page 1', { exact: true }).uncheck();
  if (!process.env.CHORALE_PAGES_INSPECT_ONLY) {
    await page.getByRole('button', { name: 'Scan selected pages', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.scan-modal [role="alert"]') || [...document.querySelectorAll('.scan-modal button')].some((button) => button.textContent === 'Import recognized score'), {}, { timeout: 200000 });
    assert.deepEqual(await page.locator('.scan-modal [role="alert"]').allTextContents(), []);
    const jobs = await readdir(join(home, 'imports'));
    assert.equal(jobs.length, 1);
    const manifest = JSON.parse(await readFile(join(home, 'imports', jobs[0], 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.pages, [4], 'Only original music page is passed to Audiveris');
    assert.deepEqual(await readFile(join(home, 'imports', jobs[0], 'source.pdf')), Buffer.from(pdf, 'base64'), 'Full original is preserved');
    assert.equal(await page.getByAltText('Scanned source page 4').count(), 1);
    await page.screenshot({ path: join(artifacts, 'mixed-pages-review.png') });
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Optional local corpus. No scores are imported or rewritten.
  const directory = process.argv[2];
  if (directory) for (const name of (await readdir(directory)).filter((name) => /\.pdf$/i.test(name)).sort()) {
    const cards = await inspect(join(directory, name));
    assert.ok(cards.length, `${name}: inspection must succeed`);
    if (process.env.CHORALE_EXPECT_ALL_MUSIC === '1') assert.ok(cards.every((card) => card.kind === 'Staves detected'), `${name}: all visually verified music pages should be retained as candidates`);
    assert.ok(cards.filter((card) => card.selected).length <= 5);
    await page.screenshot({ path: join(artifacts, name + '.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  // A failed embedded image must be reported as unknown, never non-music.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length 10 >>\nstream\nnot-a-jpeg\nendstream',
    '<< /Length 32 >>\nstream\nq 500 0 0 700 20 20 cm /Im1 Do Q\nendstream',
  ];
  let broken = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(broken)); broken += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(broken);
  broken += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const brokenFile = join(artifacts, 'broken-image.pdf');
  await writeFile(brokenFile, broken);
  const unknown = await inspect(brokenFile);
  assert.deepEqual(unknown.map((card) => card.kind), ['Check page']);
  assert.ok(unknown.every((card) => !card.selected));
  await page.getByLabel('Include page 1', { exact: true }).check();
  assert.ok(await page.getByRole('button', { name: 'Scan selected pages', exact: true }).isEnabled());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(errors, []);
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ sandboxDisabled: application.process().spawnargs.includes('--no-sandbox'), results, nativeScanTested: !process.env.CHORALE_PAGES_INSPECT_ONLY }, null, 2));
  console.log(`Page-screening smoke passed: ${artifacts}`);
} finally {
  if (application) {
    const timer = setTimeout(() => application.process().kill('SIGKILL'), 5000);
    try { await Promise.race([application.close(), new Promise((done) => setTimeout(done, 5500))]); } finally { clearTimeout(timer); }
  }
  try { const runtime = JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')); process.kill(runtime.pid, 'SIGTERM'); } catch { /* No daemon started. */ }
}
