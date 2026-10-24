import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

test('Git-source global installation launches Electron and shares HTTP/stdio score state', { timeout: 360000 }, async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'chorale-git-install-'));
  let application, browser, client, stdio;
  let output = '';
  const port = await new Promise(resolvePort => {
    const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)); });
  });
  const environment = { ...process.env, CHORALE_HOME: join(scratch, 'scores'), CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: join(scratch, 'profile'), CHORALE_SKIP_CLIENT_SETUP: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const prefix = join(scratch, 'prefix');
  const cli = join(prefix, 'bin/chorale');
  try {
    // A throwaway Git snapshot includes this worktree's changes without making
    // commits in the user's branch, fetching an old GitHub branch, or copying dist.
    const source = join(scratch, 'source'); await mkdir(source);
    const tracked = (await exec('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 5e6 })).stdout.split('\0').filter(Boolean);
    for (const file of new Set(tracked)) {
      if (file.startsWith('docs/reviews/')) continue;
      const destination = join(source, file); await mkdir(dirname(destination), { recursive: true });
      try { await cp(join(root, file), destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await exec('git', ['init', '--quiet'], { cwd: source });
    await exec('git', ['add', '.'], { cwd: source });
    await exec('git', ['-c', `core.hooksPath=${join(source, '.no-hooks')}`, '-c', 'commit.gpgSign=false', '-c', 'user.name=Chorale install test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'installation fixture'], { cwd: source });
    const result = await exec('npm', ['install', '--global', '--prefix', prefix, '--omit=dev', '--no-audit', '--no-fund', '--allow-git=root', `git+file://${source}`], {
      cwd: scratch, env: environment, timeout: 240000, maxBuffer: 5e6,
    });
    t.diagnostic(result.stdout.trim());
    const installed = join(prefix, 'lib/node_modules/chorale');
    for (const file of ['dist/index.html', 'dist-electron/main.js', 'dist-electron/preload.cjs', 'node_modules/electron/index.js']) {
      assert.ok((await readFile(join(installed, file))).length > 0, file);
    }
    assert.match((await exec(cli, ['--version'], { cwd: scratch, env: environment })).stdout, /chorale v/);
    const exited = new Promise((resolveExit, reject) => {
      application = spawn(cli, ['--', '--remote-debugging-port=0', ...(process.env.CHORALE_SMOKE_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])], { cwd: scratch, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const stream of [application.stdout, application.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-100000); });
      application.once('error', reject); application.once('close', code => resolveExit(code));
    });
    let debugUrl;
    for (let i = 0; i < 200; i++) {
      let desktopOutput = '';
      try { desktopOutput = await readFile(join(environment.CHORALE_HOME, 'desktop.log'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      debugUrl = desktopOutput.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
      if (debugUrl) break;
      if (application.exitCode !== null && application.exitCode !== 0) assert.fail(output);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    }
    assert.ok(debugUrl, output);
    browser = await chromium.connectOverCDP(debugUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page');
    await page.locator('.chorale-app-shell').waitFor({ timeout: 20000 });
    assert.equal(await exited, 0, 'Default CLI must exit while the desktop is still open');
    assert.equal(await page.locator('.chorale-app-shell').isVisible(), true, 'Desktop survives launcher exit');
    assert.equal(await page.evaluate(() => Boolean(window.choraleAI)), true);
    const base = `http://127.0.0.1:${port}`;
    const health = await (await fetch(`${base}/v1/health`)).json();
    assert.equal(health.service, 'chorale-service');
    client = new Client({ name: 'installed-http', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const created = await client.callTool({ name: 'create_new_file', arguments: { title: 'Installed desktop score', abcSource: 'X:1\nT:Installed desktop score\nM:4/4\nL:1/4\nK:C\nC D E F |]' } });
    assert.ok(!created.isError, JSON.stringify(created));
    const documentId = created.structuredContent.documentId;
    stdio = new Client({ name: 'installed-stdio', version: '1' });
    await stdio.connect(new StdioClientTransport({ command: cli, args: ['mcp'], cwd: scratch, env: environment }));
    assert.ok(JSON.stringify(await stdio.callTool({ name: 'list_files', arguments: {} })).includes(documentId));
    await stdio.close(); stdio = null; await client.close(); client = null;
    await page.close();
    assert.equal(await exited, 0, output);
    assert.equal((await fetch(`${base}/v1/health`)).status, 200, 'Closing Electron must keep MCP service available');
    await exec(cli, ['stop'], { cwd: scratch, env: environment });
    // Restart through the real installed stdio adapter, without opening a GUI.
    stdio = new Client({ name: 'installed-restarted', version: '1' });
    await stdio.connect(new StdioClientTransport({ command: cli, args: ['mcp'], cwd: scratch, env: environment }));
    assert.ok(JSON.stringify(await stdio.callTool({ name: 'list_files', arguments: {} })).includes(documentId));
    t.diagnostic('Installed default CLI, real Electron/preload, HTTP MCP, headless stdio and persistence verified. No client configuration changed.');
  } finally {
    await stdio?.close(); await client?.close();
    application?.kill('SIGTERM'); await browser?.close().catch(() => {});
    try { await exec(cli, ['stop'], { cwd: scratch, env: environment }); } catch { /* May not have started. */ }
    if (process.env.CHORALE_KEEP_INSTALL_FIXTURE === '1') t.diagnostic(`Fixture retained at ${scratch}`);
    else await rm(scratch, { recursive: true, force: true });
  }
});
