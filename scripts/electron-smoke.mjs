import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { _electron } from 'playwright-core';
import { LocalDocumentStore } from '../server/store.mjs';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'chorale-desktop-smoke-'));
const profile = join(scratch, 'profile');
await mkdir(profile);
const port = await new Promise((resolvePort) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolvePort(port));
  });
});
const abc = 'X:1\nT:Desktop smoke\nM:4/4\nL:1/4\nV:1 name="Piano"\nK:C\n[V:1] C D E F | G A B c |]';
const home = join(scratch, 'scores');
const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
await store.create({ abcSource: abc, title: 'Desktop smoke' });
store.close();
const env = { ...process.env, CHORALE_HOME: home, CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: profile, CHORALE_NODE_EXECUTABLE: process.execPath, CHORALE_SKIP_CLIENT_SETUP: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await _electron.launch({
    executablePath: require('electron'),
    args: [...(process.env.CHORALE_SMOKE_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), join(root, 'dist-electron/main.js')],
    cwd: root, env, timeout: 30000,
  });
  console.log('Desktop process connected');
  application.process().stderr.on('data', (data) => process.stderr.write(data));
  const page = await application.firstWindow({ timeout: 20000 });
  console.log('Desktop window ready');
  page.setDefaultTimeout(12000);
  await page.waitForURL('app://chorale/**');
  await page.locator('.chorale-app-shell').waitFor();
  await page.waitForLoadState('load');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (['warning', 'error'].includes(message.type())) console.log('Renderer:', message.text()); });
  // Mock only the provider boundary. Exercise real preload IPC, chat rendering,
  // revision-bound proposals, score mutation, daemon persistence and reload.
  await application.evaluate(({ ipcMain }) => {
    const connection = { id: 'smoke', name: 'Local smoke', kind: 'custom', authType: 'api-key', persistence: 'session-only', status: 'ready' };
    const handlers = {
      'chorale-ai:list-connections': () => [connection],
      'chorale-ai:get-selection': () => ({ connectionId: 'smoke', modelId: 'smoke-model' }),
      'chorale-ai:get-cached-models': () => [{ id: 'smoke-model', name: 'Smoke model', source: 'live' }],
      'chorale-ai:send-chat': (event, request) => {
        const requestId = `smoke-${Date.now()}`;
        const common = { id: 'smoke-proposal', runId: requestId, documentId: request.context.documentId, sourceRevision: request.context.revision, state: 'proposed' };
        setTimeout(() => {
          const send = (payload) => event.sender.send('chorale-ai:event', { requestId, ...payload });
          send({ type: 'chat-start', connectionId: 'smoke', providerKind: 'custom', modelId: 'smoke-model' });
          send({ type: 'chat-delta', text: 'Try this change in [m. 1](#measure-1).' });
          if (request.question.includes('annotation')) {
            const now = new Date().toISOString();
            send({ type: 'proposal-created', proposal: { ...common, annotation: {
              id: 'smoke-annotation', kind: 'explanation', span: { startMeasure: 1, endMeasure: 1 }, label: 'Smoke annotation', body: 'Preserve the opening idea.', source: 'assistant', createdAt: now, updatedAt: now,
            } } });
          } else {
            send({ type: 'score-proposal-created', proposal: { ...common, kind: 'replace-measures', span: { startMeasure: 1, endMeasure: 1 }, summary: 'Reverse the opening', replacementAbc: 'F E D C |', validation: { status: 'valid', errors: [] } } });
          }
          send({ type: 'chat-done' });
        }, 500);
        return { requestId };
      },
    };
    for (const [channel, handler] of Object.entries(handlers)) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
  });
  console.log('Reloading workspace');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ask about the current sheet' }).waitFor();
  await page.locator('#paper svg').first().waitFor();
  console.log('Score and chat rendered');
  assert.equal(await page.locator('.right-panel, .right-rail').count(), 0, 'No right rail remains');
  assert.equal(await page.locator('.workspace-body > *').count(), 2, 'Sidebar and center are the only workspace columns');
  assert.equal(await page.locator('.file-rail #chat-panel .agent-panel').count(), 1, 'Chat belongs to the left sidebar');
  const chatInput = page.getByRole('textbox', { name: 'Ask about the current sheet' });
  await chatInput.fill('Keep this draft while navigating');
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Import score', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  assert.equal(await chatInput.inputValue(), 'Keep this draft while navigating', 'Switching tabs preserves the draft');
  await chatInput.fill('');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await chatInput.waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Chat', exact: true }).getAttribute('aria-selected'), 'true', 'Reopening after reload restores Chat');
  // The same in-flow sidebar owns resizing for every tab, including at narrow widths.
  const desktopSize = page.viewportSize();
  await page.evaluate(() => localStorage.setItem('chorale.workspace.fileRailWidth', '240'));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await chatInput.waitFor();
  for (const width of [1024, 800, 1480]) {
    await page.setViewportSize({ width, height: 960 });
    await page.waitForFunction(() => document.querySelector('.file-rail').clientWidth >= 336);
    const geometry = await page.evaluate(() => {
      const bounds = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { rail: bounds('.file-rail'), center: bounds('.central-column'), chat: bounds('.agent-panel'), composer: bounds('.agent-composer'), viewport: innerWidth, height: innerHeight };
    });
    assert.ok(Math.abs(geometry.rail.right - geometry.center.left) < 2, 'Sidebar stays inline beside the score');
    assert.ok(geometry.center.right <= geometry.viewport + 2, 'Center ends at the right viewport edge');
    assert.ok(geometry.chat.bottom <= geometry.height + 2, 'Chat stays inside viewport');
    assert.ok(geometry.composer.bottom <= geometry.height + 2, 'Composer stays reachable');
    assert.ok(geometry.composer.right <= geometry.rail.right + 2, 'Composer fits inside the shared sidebar');
    if (process.env.CHORALE_SMOKE_SCREENSHOT) {
      await page.screenshot({ path: resolve(process.env.CHORALE_SMOKE_SCREENSHOT.replace(/\.png$/, `-${width}.png`)) });
    }
  }
  if (desktopSize) await page.setViewportSize(desktopSize);
  const resizeHandle = await page.getByRole('button', { name: 'Resize sidebar', exact: true }).boundingBox();
  const railBefore = await page.locator('.file-rail').boundingBox();
  await page.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + resizeHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeHandle.x + resizeHandle.width / 2 + 60, resizeHandle.y + resizeHandle.height / 2, { steps: 5 });
  await page.mouse.up();
  const railAfter = await page.locator('.file-rail').boundingBox();
  assert.ok(railAfter.width > railBefore.width + 40, 'Shared right-edge handle grows Chat');
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  assert.equal((await page.locator('.file-rail').boundingBox()).width, railAfter.width, 'Files shares the resized width');
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  const growRailToLimit = async () => {
    const handle = await page.getByRole('button', { name: 'Resize sidebar', exact: true }).boundingBox();
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 2000, y, { steps: 8 });
    await page.mouse.up();
    return (await page.locator('.file-rail').boundingBox()).width;
  };
  const wideRail = await growRailToLimit();
  assert.ok(wideRail > 560, 'Chat grows past the retired fixed 560px cap');
  assert.ok((await page.locator('.central-column').boundingBox()).width >= 560, 'The center retains its minimum reading width');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await chatInput.waitFor();
  assert.equal((await page.locator('.file-rail').boundingBox()).width, wideRail, 'A wide chat preference survives reload');
  await page.getByRole('button', { name: 'ABC code', exact: true }).click();
  assert.equal((await page.locator('.file-rail').boundingBox()).width, wideRail, 'Stacked ABC does not reserve extra horizontal space');
  const chooseLayout = async (name) => {
    await page.getByRole('button', { name: 'Open pane', exact: true }).click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
  };
  await chooseLayout('Columns');
  const columnRail = (await page.locator('.file-rail').boundingBox()).width;
  assert.ok(columnRail < wideRail, 'Side-by-side ABC reserves its minimum width');
  await page.getByRole('button', { name: 'Waterfall', exact: true }).click();
  assert.ok((await page.locator('.file-rail').boundingBox()).width < columnRail, 'Side-by-side Waterfall reserves its minimum width');
  for (const selector of ['.score-pane', '.editor-pane', '.waterfall-pane']) {
    const pane = await page.locator(selector).boundingBox();
    const center = await page.locator('.central-column').boundingBox();
    assert.ok(pane.width >= 140 && pane.x >= center.x && pane.x + pane.width <= center.x + center.width + 2, `${selector} stays within the center above its minimum width`);
  }
  await chooseLayout('Split stack left');
  assert.equal((await page.locator('.file-rail').boundingBox()).width, wideRail, 'Split stacks reserve shared column width');
  await chooseLayout('Rows');
  assert.equal((await page.locator('.file-rail').boundingBox()).width, wideRail, 'Returning to rows restores the wider chat preference');
  await page.getByRole('button', { name: 'Close ABC source pane', exact: true }).click();
  await page.getByRole('button', { name: 'Close Waterfall pane', exact: true }).click();
  console.log('Chat width passed: grows beyond 560px, fits pane minimums, follows layout, and survives reload');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'API providers' }).waitFor();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.getByRole('button', { name: 'Waterfall', exact: true }).click();
  await page.getByRole('region', { name: 'Waterfall pane' }).waitFor();
  await page.getByRole('button', { name: 'ABC code', exact: true }).click();
  assert.equal(await page.locator('.audio-player-card').count(), 1);
  const input = page.getByRole('textbox', { name: 'Ask about the current sheet' });
  console.log('Desktop settings and panes passed');
  await page.getByRole('button', { name: 'Close ABC source pane', exact: true }).click();
  await page.getByRole('button', { name: 'Close Waterfall pane', exact: true }).click();
  // Exercise the controls combined from the playback and desktop branches before
  // accepting a revision. Staff instruments edit ABC; mute/solo stay local.
  const beforeMixer = await page.evaluate(async () => (await fetch('/v1/workspace')).json());
  await page.getByRole('button', { name: 'Piano: staff sounds', exact: true }).click();
  const voices = page.getByRole('dialog', { name: 'Staff sound', exact: true });
  await voices.getByRole('button', { name: /^Instrument for / }).first().click();
  const instrumentSearch = voices.getByRole('combobox', { name: /^Search instruments for / });
  await instrumentSearch.fill('Flute');
  await instrumentSearch.press('Enter');
  assert.match(await voices.getByRole('button', { name: /^Instrument for / }).first().innerText(), /^Flute\s*⌄$/);
  let afterInstrument;
  const instrumentDeadline = Date.now() + 12000;
  do {
    afterInstrument = await page.evaluate(async () => (await fetch('/v1/workspace', { cache: 'no-store' })).json());
    if (afterInstrument.documents.some((document) => document.abcSource.includes('MIDI=program 73'))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < instrumentDeadline);
  assert.equal(afterInstrument.documents.length, beforeMixer.documents.length);
  assert.ok(afterInstrument.documents[0].revision > beforeMixer.documents[0].revision, 'Instrument edits create a saved score revision');
  assert.ok(afterInstrument.documents[0].abcSource.includes('C D E F | G A B c |]'), 'Instrument edits preserve notes');
  const mute = voices.getByRole('button', { name: /^Mute / }).first();
  await mute.click();
  assert.equal(await mute.getAttribute('aria-pressed'), 'true');
  const afterMixer = await page.evaluate(async () => (await fetch('/v1/workspace')).json());
  assert.deepEqual(afterMixer.documents, afterInstrument.documents, 'Mute must not change score revisions or content');
  await voices.getByRole('button', { name: 'Reset listening', exact: true }).click();
  await voices.getByRole('button', { name: 'Close staff sound', exact: true }).click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Scan PDF / PNG', exact: true }).click();
  await page.getByLabel('Sheet music file').waitFor();
  await page.getByRole('button', { name: 'Close scan', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  console.log('Desktop staff instrument editing, local listening controls, and scan entry passed');
  await input.fill('Add an annotation');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Apply All', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.getByRole('button', { name: 'Apply All', exact: true }).click();
  if (process.env.CHORALE_SMOKE_SCREENSHOT) await page.screenshot({ path: resolve(process.env.CHORALE_SMOKE_SCREENSHOT) });
  await page.getByRole('complementary', { name: 'Annotations', exact: true }).getByText('Smoke annotation', { exact: true }).waitFor();
  console.log('Annotation accepted');
  await input.fill('Suggest a revision');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByText('Previewing measure 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await input.waitFor();
  await page.waitForFunction(async () => {
    const response = await fetch('/v1/workspace');
    const { documents } = await response.json();
    return documents.some((document) => document.abcSource.includes('F E D C') && document.annotations.some((a) => a.id === 'smoke-annotation'));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('complementary', { name: 'Annotations', exact: true }).getByText('Smoke annotation', { exact: true }).waitFor();
  assert.ok((await page.locator('.agent-message').count()) >= 4, 'Conversation survives reload');
  const transcript = await page.locator('.agent-transcript').evaluate((node) => ({ height: node.clientHeight, overflow: getComputedStyle(node).overflowY }));
  assert.ok(transcript.height > 0 && ['auto', 'scroll'].includes(transcript.overflow), 'Transcript has a bounded scrolling viewport');
  const dock = await page.locator('.audio-player-card').boundingBox();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  assert.ok(dock && dock.y + dock.height <= viewportHeight + 2, 'Playback dock remains visible');
  assert.deepEqual(errors, []);
  if (process.env.CHORALE_SMOKE_SCREENSHOT) await page.screenshot({ path: resolve(process.env.CHORALE_SMOKE_SCREENSHOT) });
  console.log('Electron smoke passed: desktop launch, shared score storage, providers, three panes, shared left Chat rail, tab switching, drafts, resizing, responsive geometry, chat IPC, background response, annotation Apply All, score preview/apply, transcript persistence, playback layout. Provider responses were simulated.');
} catch (error) {
  console.error('Desktop smoke failed:', error);
  throw error;
} finally {
  if (application) {
    const shutdown = setTimeout(() => application.process().kill('SIGKILL'), 5000);
    try { await Promise.race([application.close(), new Promise((resolve) => setTimeout(resolve, 5500))]); } finally { clearTimeout(shutdown); }
  }
  try { const runtime = JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')); process.kill(runtime.pid, 'SIGTERM'); } catch { /* no daemon was started */ }
  await rm(scratch, { recursive: true, force: true });
}
