import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

test('installed CLI includes the built UI and preserves scores across restart', { timeout: 240_000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'chorale-install-'));
  let running;
  let store;
  let client;
  const stop = async () => {
    await client?.close();
    client = undefined;
    if (running) {
      running.httpServer.closeAllConnections();
      await new Promise((resolveClose, reject) => running.httpServer.close(error => error ? reject(error) : resolveClose()));
      running = undefined;
    }
    store?.close();
    store = undefined;
  };
  try {
    // Pack with lifecycle scripts enabled: neither a checkout's dist nor a stub UI is sufficient.
    await exec('npm', ['pack', '--pack-destination', temporary], { cwd: root, timeout: 120_000 });
    const sourcePackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const archive = join(temporary, `chorale-${sourcePackage.version}.tgz`);
    const prefix = join(temporary, 'install');
    await exec('npm', ['install', '--global', '--prefix', prefix, '--omit=dev', '--no-audit', '--no-fund', archive], {
      cwd: temporary, timeout: 120_000,
    });
    const installed = join(prefix, 'lib/node_modules/chorale');
    const version = await exec(join(prefix, 'bin/chorale'), ['--version'], { cwd: temporary });
    assert.match(version.stdout, new RegExp(`chorale v${sourcePackage.version.replaceAll('.', '\\.')}`));
    const { startServer } = await import(pathToFileURL(join(installed, 'server/api_server.mjs')).href);
    const { LocalDocumentStore } = await import(pathToFileURL(join(installed, 'server/store.mjs')).href);
    const start = async () => {
      store = new LocalDocumentStore({ baseDir: join(temporary, 'scores'), dbPath: join(temporary, 'scores', 'chorale.db') });
      running = await startServer({ port: 0, store });
      return `http://127.0.0.1:${running.port}`;
    };
    let base = await start();
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /id="root"/);
    assert.doesNotMatch(html, /build the frontend/);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(match => match[1]);
    assert.ok(assets.some(asset => asset.endsWith('.js')));
    assert.ok(assets.some(asset => asset.endsWith('.css')));
    for (const asset of assets) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
      assert.doesNotMatch(response.headers.get('content-type'), /text\/html/, asset);
    }
    const abc = 'X:1\nT:Fresh install\nM:2/4\nL:1/4\nK:C\nC D | E2 |]';
    const createdResponse = await fetch(`${base}/v1/tools/create_new_file`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Fresh install', abcSource: abc }),
    });
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json();
    assert.ok(!created.isError, JSON.stringify(created));
    const id = created.structuredContent.documentId;
    assert.ok(id);
    await stop();
    base = await start();
    const reopened = await (await fetch(`${base}/v1/scores/${id}`)).json();
    assert.equal(reopened.abcSource, abc);
    assert.equal(reopened.title, 'Fresh install');
    const exported = await (await fetch(`${base}/v1/tools/export_file`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: id, format: 'abc' }),
    })).json();
    assert.ok(!exported.isError);
    assert.equal(exported.structuredContent.content, abc);

    // Launch the freshly installed CLI's real stdio adapter against its own
    // installed HTTP daemon. The checkout's analyzer is never imported here.
    const cliUrl = pathToFileURL(join(installed, 'server/cli.mjs')).href;
    client = new Client({ name: 'installed-harmony-verification', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--input-type=module', '--eval', `import { runCli } from ${JSON.stringify(cliUrl)}; await runCli({ args: ['mcp'], port: ${running.port} });`],
      env: { ...process.env, CHORALE_HOME: join(temporary, 'scores') },
      cwd: temporary,
    }));
    const analyzed = await client.callTool({ name: 'analyze_harmony', arguments: {
      documentId: id, startMeasure: 1, endMeasure: 2,
    } });
    if (analyzed.isError) {
      assert.notEqual(process.env.CHORALE_REQUIRE_MUSIC21, '1', `Required installed analysis failed: ${JSON.stringify(analyzed)}`);
      assert.equal(analyzed.structuredContent.errorCode, 'MUSIC21_UNAVAILABLE', JSON.stringify(analyzed));
      assert.match(analyzed.content[0].text, /chorale setup music21/);
      t.diagnostic('Fresh installation, score persistence and export verified without optional music21');
    } else {
      const evidence = analyzed.structuredContent;
      assert.equal(evidence.schemaVersion, 1);
      assert.equal(evidence.documentId, id);
      assert.equal(evidence.revision, reopened.revision);
      assert.deepEqual(evidence.range, { startMeasure: 1, endMeasure: 2 });
      assert.equal(evidence.engine.name, 'music21');
      if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') assert.equal(evidence.engine.version, '9.9.1');
      assert.equal(evidence.estimatedPassageKey, 'C major');
      assert.equal(evidence.keySource, 'written');
      assert.deepEqual(evidence.slices.map(({ position, durationQuarterLength, soundingPitches, literalBass }) => ({
        position, durationQuarterLength, soundingPitches, literalBass,
      })), [
        { position: { measure: 1, offsetQuarterLength: '0' }, durationQuarterLength: '1', soundingPitches: ['C4'], literalBass: 'C4' },
        { position: { measure: 1, offsetQuarterLength: '1' }, durationQuarterLength: '1', soundingPitches: ['D4'], literalBass: 'D4' },
        { position: { measure: 2, offsetQuarterLength: '0' }, durationQuarterLength: '2', soundingPitches: ['E4'], literalBass: 'E4' },
      ]);
    }
    const afterAnalysis = await (await fetch(`${base}/v1/scores/${id}`)).json();
    assert.deepEqual(afterAnalysis, reopened, 'Installed harmony analysis must not mutate the score or revision');
  } finally {
    await stop();
    await rm(temporary, { recursive: true, force: true });
  }
});
