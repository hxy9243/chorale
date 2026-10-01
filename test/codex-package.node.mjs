import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { packageCodex } from '../tools/package-codex.mjs';
import { CHORALE_VERSION } from '../server/version.mjs';

test('fresh Codex package uses the browser service and current library', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'chorale-package-test-'));
  const output = join(temporary, 'chorale-codex-plugin');
  const previousHome = process.env.CHORALE_HOME;
  let running;
  let client;
  try {
    await mkdir(output);
    await writeFile(join(output, 'server.mjs'), 'obsolete package');
    const distDir = join(temporary, 'ui');
    await mkdir(distDir);
    await writeFile(join(distDir, 'index.html'), '<!doctype html><html><body>Chorale package test</body></html>');
    await packageCodex(output, { distDir });
    await assert.rejects(access(join(output, 'server.mjs')));
    const manifest = JSON.parse(await readFile(join(output, '.codex-plugin/plugin.json'), 'utf8'));
    assert.equal(manifest.mcpServers, './.mcp.json');
    const mcpConfig = JSON.parse(await readFile(join(output, '.mcp.json'), 'utf8'));
    assert.ok(mcpConfig.mcpServers.chorale.env_vars.includes('CHORALE_HOME'));
    assert.ok(mcpConfig.mcpServers.chorale.env_vars.includes('CHORALE_MUSIC21_PYTHON'));
    assert.equal(manifest.version, CHORALE_VERSION);
    const scoreSkill = await readFile(join(output, 'skills/chorale-score/SKILL.md'), 'utf8');
    assert.match(scoreSkill, /Mandatory Pre-Annotation Verification/);
    const harmonicReference = await readFile(join(output, 'skills/chorale-score/references/chord-progression-analysis.md'), 'utf8');
    assert.match(harmonicReference, /Mandatory Annotation Accuracy Audit/);
    assert.match(harmonicReference, /Em\/G.*vi6/);
    assert.match(harmonicReference, /Using music21 Evidence Without Deferring Judgment/);
    assert.match(await readFile(join(output, 'server/python/requirements-music21.txt'), 'utf8'), /music21==9\.9\.1/);
    assert.match(await readFile(join(output, 'server/python/music21_harmony.py'), 'utf8'), /Fallible deterministic evidence/);
    const bundle = await readFile(join(output, 'server/cli.mjs'), 'utf8');
    assert.equal(bundle.includes('codex-plugin-store.json'), false);
    assert.equal(bundle.includes('43171'), false);

    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    process.env.CHORALE_HOME = join(temporary, 'home');
    const moduleUrl = pathToFileURL(join(output, 'server/cli.mjs')).href;
    const { runDaemon } = await import(moduleUrl);
    running = await runDaemon({ port });

    client = new Client({ name: 'package-verification', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--input-type=module', '--eval', `import { runCli } from ${JSON.stringify(moduleUrl)}; await runCli({ args: ['mcp'], port: ${port} });`],
      env: { ...process.env },
      cwd: temporary,
    }));
    assert.equal(client.getServerVersion().version, CHORALE_VERSION);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.ok(names.includes('create_new_file'));
    assert.ok(names.includes('list_files'));
    assert.ok(names.includes('analyze_harmony'));
    assert.ok(!names.includes('create_score'));
    const created = await client.callTool({ name: 'create_new_file', arguments: {
      title: 'Package check', abcSource: 'X:1\nT:Package check\nM:2/4\nL:1/8\nK:A\nAc ec | A4 |]',
    } });
    assert.ok(!created.isError);
    const id = created.structuredContent.documentId;
    const persisted = await (await fetch(`http://127.0.0.1:${port}/v1/scores/${id}`)).json();
    assert.equal(persisted.title, 'Package check');
    // Execute through the packaged CLI and stdio-to-daemon path. Merely
    // shipping a helper file does not prove bundled URL resolution works.
    const analyzed = await client.callTool({ name: 'analyze_harmony', arguments: {
      documentId: id, startMeasure: 1, endMeasure: 2,
    } });
    if (analyzed.isError) {
      assert.notEqual(process.env.CHORALE_REQUIRE_MUSIC21, '1', `Required packaged analysis failed: ${JSON.stringify(analyzed)}`);
      assert.equal(analyzed.structuredContent.errorCode, 'MUSIC21_UNAVAILABLE', JSON.stringify(analyzed));
      assert.match(analyzed.content[0].text, /chorale setup music21/);
      t.diagnostic('Packaged score features verified without the optional music21 interpreter');
    } else {
      const evidence = analyzed.structuredContent;
      assert.equal(evidence.schemaVersion, 1);
      assert.equal(evidence.documentId, id);
      assert.equal(evidence.revision, persisted.revision);
      assert.deepEqual(evidence.range, { startMeasure: 1, endMeasure: 2 });
      assert.equal(evidence.engine.name, 'music21');
      if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') assert.equal(evidence.engine.version, '9.9.1');
      assert.equal(evidence.estimatedPassageKey, 'A major');
      assert.equal(evidence.keySource, 'written');
      assert.deepEqual(evidence.slices.map(({ position, durationQuarterLength, soundingPitches, literalBass }) => ({
        position, durationQuarterLength, soundingPitches, literalBass,
      })), [
        { position: { measure: 1, offsetQuarterLength: '0' }, durationQuarterLength: '1/2', soundingPitches: ['A4'], literalBass: 'A4' },
        { position: { measure: 1, offsetQuarterLength: '1/2' }, durationQuarterLength: '1/2', soundingPitches: ['C#5'], literalBass: 'C#5' },
        { position: { measure: 1, offsetQuarterLength: '1' }, durationQuarterLength: '1/2', soundingPitches: ['E5'], literalBass: 'E5' },
        { position: { measure: 1, offsetQuarterLength: '3/2' }, durationQuarterLength: '1/2', soundingPitches: ['C#5'], literalBass: 'C#5' },
        { position: { measure: 2, offsetQuarterLength: '0' }, durationQuarterLength: '2', soundingPitches: ['A4'], literalBass: 'A4' },
      ]);
    }
    const afterAnalysis = await (await fetch(`http://127.0.0.1:${port}/v1/scores/${id}`)).json();
    assert.deepEqual(afterAnalysis, persisted, 'Packaged harmony analysis must not mutate the score or revision');
    const listed = await client.callTool({ name: 'list_files', arguments: {} });
    assert.ok(listed.structuredContent.files.some(file => file.documentId === id));
    const db = new DatabaseSync(join(process.env.CHORALE_HOME, 'chorale.db'));
    const row = db.prepare('SELECT id FROM documents WHERE id = ?').get(id);
    assert.equal(row?.id, id);
    db.close();
    await assert.rejects(access(join(process.env.CHORALE_HOME, 'store.json')));
    await assert.rejects(access(join(process.env.CHORALE_HOME, 'codex-plugin-store.json')));
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/);
  } finally {
    await client?.close();
    await running?.stop();
    if (previousHome === undefined) delete process.env.CHORALE_HOME;
    else process.env.CHORALE_HOME = previousHome;
    await rm(temporary, { recursive: true, force: true });
  }
});
