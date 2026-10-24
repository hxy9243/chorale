// Run after npm run build. Uses a temporary score database and browser profile.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../server/api_server.mjs';
import { LocalDocumentStore } from '../server/store.mjs';

const scratch = await mkdtemp(join(tmpdir(), 'chorale-playback-layout-'));
const store = new LocalDocumentStore({ baseDir: scratch, seedDefault: false });
await store.create({ title: 'Playback layout', abcSource: 'X:1\nT:Playback layout\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]' });
let server;
let browser;
try {
  server = await startServer({ port: 0, store });
  browser = await chromium.launch({ executablePath: process.env.CHORALE_CHROMIUM || '/opt/google/chrome/chrome' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.locator('.audio-slider').waitFor();
  await page.evaluate(() => document.fonts.ready);
  let cases = 0;
  for (const viewportWidth of [1600, 700, 400]) {
    await page.setViewportSize({ width: viewportWidth, height: 1000 });
    for (const width of [600, 1200, 1080, 900, 760, 640, 480, 400, 360, 320].filter(w => w <= viewportWidth)) {
      await page.locator('.central-column').evaluate((element, width) => {
        for (const property of ['width', 'max-width']) element.style.setProperty(property, `${width}px`, 'important');
        element.style.setProperty('flex', 'none', 'important');
      }, width);
      // Cover the longest volume readout and a long passage label as well.
      for (const selected of [false, true]) {
        await page.locator('.playback-selection-slot').evaluate((element, selected) => {
          element.innerHTML = selected
            ? '<div class="playback-loop-pill"><span>Selected m. 123–140, beat 4</span></div>'
            : '<span class="playback-selection-empty">No selection</span>';
        }, selected);
        await page.locator('.slider-value').evaluate((element, selected) => { element.textContent = selected ? '100%' : '0%'; }, selected);
        const geometry = await page.locator('.audio-player-card').evaluate(card => {
          const rect = element => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          };
          return {
            card: rect(card), slider: rect(card.querySelector('.audio-slider')),
            controls: [...card.querySelector('.player-controls-bar').children].map(rect),
            text: [...card.querySelectorAll('.playback-progress-time, .slider-value')].map(rect),
          };
        });
        const label = `viewport ${viewportWidth}, score column ${width}, selected ${selected}`;
        assert.equal(geometry.slider.width, 64, `${label}: volume track must stay 64px`);
        for (const control of [...geometry.controls, ...geometry.text]) {
          assert.ok(control.x >= geometry.card.x - 1 && control.x + control.width <= geometry.card.x + geometry.card.width + 1, `${label}: control clipped horizontally`);
          assert.ok(control.y >= geometry.card.y && control.y + control.height <= geometry.card.y + geometry.card.height, `${label}: control clipped vertically`);
        }
        for (let i = 0; i < geometry.controls.length; i++) {
          for (const other of geometry.controls.slice(i + 1)) {
            const control = geometry.controls[i];
            const overlapX = Math.min(control.x + control.width, other.x + other.width) - Math.max(control.x, other.x);
            const overlapY = Math.min(control.y + control.height, other.y + other.height) - Math.max(control.y, other.y);
            assert.ok(overlapX <= 1 || overlapY <= 1, `${label}: controls overlap`);
          }
        }
        cases++;
      }
      if (viewportWidth === 1600 && [1080, 600, 320].includes(width) && process.env.CHORALE_LAYOUT_SCREENSHOTS) {
        await mkdir(resolve(process.env.CHORALE_LAYOUT_SCREENSHOTS), { recursive: true });
        await page.locator('.playback-dock-container').screenshot({ path: resolve(process.env.CHORALE_LAYOUT_SCREENSHOTS, `playback-${width}.png`) });
      }
    }
  }
  console.log(`Playback layout passed: ${cases} cases, fixed 64px volume track, no clipping or overlapping controls.`);
} finally {
  await browser?.close();
  if (server) {
    server.httpServer.closeAllConnections();
    await new Promise(resolve => server.httpServer.close(resolve));
    await server.mcpServer.close();
  }
  store.close();
  await rm(scratch, { recursive: true, force: true });
}
