import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { chromium } from 'playwright-core';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'bin/chorale.mjs');

for (const debug of [false, true]) {
  test(`real Electron ${debug ? 'debug launch stays attached' : 'default launch detaches and repeated launch focuses'}`, { timeout: 60_000 }, async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'chorale-detach-smoke-'));
    const port = await new Promise(resolvePort => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)); });
    });
    const env = { ...process.env, CHORALE_HOME: join(scratch, 'scores'), CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: join(scratch, 'profile'), CHORALE_SKIP_CLIENT_SETUP: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    let launcher, browser, page;
    let output = '';
    try {
      launcher = spawn(process.execPath, [cli, ...(debug ? ['--debug'] : []), '--', '--remote-debugging-port=0'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const exited = new Promise((resolveExit, reject) => {
        launcher.once('error', reject);
        launcher.once('close', code => resolveExit(code));
      });
      for (const stream of [launcher.stdout, launcher.stderr]) stream.on('data', chunk => { output += chunk; });
      let debugUrl;
      for (let i = 0; i < 200; i++) {
        let desktopOutput = output;
        if (!debug) {
          try { desktopOutput = await readFile(join(env.CHORALE_HOME, 'desktop.log'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        debugUrl = desktopOutput.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
        if (debugUrl) break;
        if (launcher.exitCode !== null && launcher.exitCode !== 0) assert.fail(output + desktopOutput);
        await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
      }
      assert.ok(debugUrl, output);
      browser = await chromium.connectOverCDP(debugUrl);
      const context = browser.contexts()[0];
      page = context.pages()[0] || await context.waitForEvent('page');
      await page.locator('.chorale-app-shell').waitFor({ timeout: 20_000 });
      if (debug) {
        assert.equal(launcher.exitCode, null, 'Debug launcher stays attached while its window is open');
        assert.match(output, /DevTools listening/);
      } else {
        assert.equal(await exited, 0, 'Default launcher exits while the window is open');
        assert.equal(await page.locator('.chorale-app-shell').isVisible(), true);
        await exec(process.execPath, [cli], { cwd: root, env, timeout: 10_000 });
        assert.equal(context.pages().length, 1, 'Second launch focuses the existing desktop');
      }
      await page.close(); page = undefined;
      assert.equal(await exited, 0);
      assert.equal((await fetch(`http://127.0.0.1:${port}/v1/health`)).status, 200, 'Desktop close preserves the shared daemon');
    } finally {
      await page?.close().catch(() => {});
      await browser?.close().catch(() => {});
      if (launcher?.exitCode === null) launcher.kill('SIGTERM');
      try { await exec(process.execPath, [cli, 'stop'], { cwd: root, env, timeout: 5000 }); } catch { /* Daemon may not have started. */ }
      await rm(scratch, { recursive: true, force: true });
    }
  });
}
