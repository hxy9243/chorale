// Run after npm run build. Uses an isolated score store and a simulated desktop
// provider bridge; never sends a prompt or touches the user's documents.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../server/api_server.mjs';
import { LocalDocumentStore } from '../server/store.mjs';

const scratch = await mkdtemp(join(tmpdir(), 'chorale-score-menu-'));
const store = new LocalDocumentStore({ baseDir: scratch, seedDefault: false });
await store.create({ title: 'Selection menu', abcSource: 'X:1\nT:Selection menu\nM:4/4\nL:1/4\nQ:1/4=240\nK:C\nC D E F | G A B c | c B A G | F E D C |]' });
let server;
let browser;
let page;
try {
  server = await startServer({ port: 0, store });
  browser = await chromium.launch({ executablePath: process.env.CHORALE_CHROMIUM || '/opt/google/chrome/chrome',
    args: ['--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__chatRequests = 0;
    window.choraleAI = {
      listConnections: async () => [{ id: 'smoke', name: 'Smoke test', kind: 'openai', status: 'ready', authType: 'api-key', persistence: 'memory' }],
      getSelection: async () => ({ connectionId: 'smoke', modelId: 'smoke' }),
      getCachedModels: async () => [{ id: 'smoke', name: 'Smoke test', source: 'live' }],
      onAIEvent: () => () => {},
      sendChat: () => { window.__chatRequests++; throw new Error('This test must not send a prompt'); },
    };
    window.__audioStarts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.__audioStarts.push({ time: this.context.currentTime, offset: args[1] ?? 0 });
      return start.apply(this, args);
    };
  });
  page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.port}`);
  const measure = (number) => page.locator(`.abcjs-measure-hit-area[data-measure="${number}"]`).first();
  const menuItem = (name) => page.getByRole('menuitem', { name, exact: true });
  await measure(1).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await measure(1).click();
  await measure(3).click({ modifiers: ['Shift'] });
  await measure(2).click({ button: 'right' });
  assert.equal(await page.locator('.abcjs-measure-hit-area[aria-pressed="true"]').count(), 3);
  assert.equal(await page.getByRole('menu').getByRole('menuitem').count(), 7);
  assert.match(await page.getByRole('menu').innerText(), /mm\. 1–3/);
  if (process.env.CHORALE_MENU_SCREENSHOTS) {
    await mkdir(resolve(process.env.CHORALE_MENU_SCREENSHOTS), { recursive: true });
    await page.screenshot({ path: resolve(process.env.CHORALE_MENU_SCREENSHOTS, 'selection-menu.png') });
  }
  await menuItem('Edit in ABC').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-cell-text'));
  assert.equal(await page.locator('.abc-timeline-measure.is-selected').count(), 3);
  await measure(2).click({ button: 'right' });
  await menuItem('Add chord symbol…').click();
  assert.equal(await page.getByRole('combobox', { name: 'Kind', exact: true }).inputValue(), 'chord');
  await page.getByLabel('Chord symbol', { exact: true }).fill('Cmaj7');
  await page.getByRole('button', { name: 'Save annotation', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Cmaj7 annotation', exact: true }).waitFor();
  await measure(2).click({ button: 'right' });
  await menuItem('Add annotation…').click();
  await page.getByLabel('Label', { exact: true }).fill('Phrase');
  await page.getByLabel('Explanation', { exact: true }).fill('Shape this as one phrase.');
  await page.getByRole('button', { name: 'Save annotation', exact: true }).click();
  await page.getByRole('button', { name: /Phrase/ }).first().waitFor();
  await measure(2).click({ button: 'right' });
  await menuItem('Ask about selection…').click();
  const composer = page.getByLabel('Ask about the current sheet');
  await composer.fill('Why does this phrase work?');
  await measure(4).click();
  assert.match(await page.locator('.agent-composer').innerText(), /mm\. 1–3/);
  await measure(4).click({ button: 'right' });
  await menuItem('Ask about selection in new chat…').click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Ask about the current sheet"]')?.value === '');
  assert.equal(await composer.inputValue(), '');
  await page.getByLabel('Conversation history', { exact: true }).click();
  assert.equal(await page.getByRole('listbox', { name: 'Conversation threads' }).getByRole('option').count(), 2);
  await page.keyboard.press('Escape');
  await measure(2).click();
  await measure(3).click({ modifiers: ['Shift'] });
  await measure(2).click({ button: 'right' });
  await menuItem('Loop selection').click();
  await page.getByText('Looping mm. 2–3', { exact: true }).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.__audioStarts.length > 0, undefined, { timeout: 60000 });
  const firstStart = await page.evaluate(() => window.__audioStarts[0].time);
  await page.waitForFunction((time) => window.__audioStarts.some((start) =>
    start.time >= time + 1.8 && Math.abs(start.offset - 1) < 0.05), firstStart, { timeout: 10000 });
  assert.ok(await page.getByTitle('Pause Audio').isVisible());
  await page.getByTitle('Stop & Reset').click();
  await measure(2).click({ button: 'right' });
  await menuItem('Play selection').click();
  await page.getByTitle('Pause Audio').waitFor();
  await page.getByTitle('Play Piano Synthesizer').waitFor({ timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__chatRequests), 0);

  // Interface zoom and a small viewport must not clip the popup.
  await page.setViewportSize({ width: 900, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui-zoom', '1.5');
    localStorage.setItem('chorale.workspace.interfaceZoom', '150');
  });
  for (let zoomAttempt = 0; zoomAttempt < 3; zoomAttempt++) {
    await page.reload();
    await measure(1).waitFor();
    await page.getByRole('button', { name: 'Edit Cmaj7 annotation', exact: true }).waitFor();
    await page.getByRole('button', { name: /Phrase/ }).first().waitFor();
    await measure(1).click({ button: 'right' });
    const bounds = await page.getByRole('menu').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 900 && bounds.y + bounds.height <= 720);
    await page.keyboard.press('End');
    assert.equal(await page.locator(':focus').innerText(), 'Ask about selection in new chat…');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Sheet music');
  }
  // Verify the actual web capability boundary, without a simulated desktop bridge.
  const web = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  web.on('pageerror', (error) => errors.push(error.message));
  await web.goto(`http://127.0.0.1:${server.port}`);
  const webMeasure = web.locator('.abcjs-measure-hit-area[data-measure="2"]').first();
  await webMeasure.click({ button: 'right' });
  assert.ok(await web.getByRole('menuitem', { name: 'Ask about selection…', exact: true }).isDisabled());
  assert.ok(await web.getByRole('menuitem', { name: 'Ask about selection in new chat…', exact: true }).isDisabled());
  await web.getByRole('menuitem', { name: 'Edit in ABC', exact: true }).click();
  await web.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.includes('measure 2'));
  await web.close();
  assert.deepEqual(errors, []);
  console.log('Score menu smoke passed: preserved range, ABC focus, chord/annotation saves, both chat routes, real playback/loop restart, zoom bounds, and keyboard dismissal. Provider calls were not made.');
} catch (error) {
  if (page) {
    await page.screenshot({ path: '/tmp/chorale-score-menu-failure.png' });
    console.error((await page.locator('body').innerText()).slice(-5000));
  }
  throw error;
} finally {
  await browser?.close();
  if (server) {
    server.httpServer.closeAllConnections();
    await new Promise((resolve) => server.httpServer.close(resolve));
    await server.mcpServer.close();
  }
  store.close();
  await rm(scratch, { recursive: true, force: true });
}
