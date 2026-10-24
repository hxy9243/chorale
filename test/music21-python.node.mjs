import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { analyzeMusic21Python, prepareMusic21Input } from '../server/music21-python.mjs';
import { resolveMusic21Python } from '../server/music21.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LocalDocumentStore } from '../server/store.mjs';
import { startServer } from '../server/api_server.mjs';

const abcSource = 'X:1\nT:Triads\nM:4/4\nL:1/4\nK:C\n[C E G]4 | [G B d]4 |]';
const input = { abcSource, documentId: 'fixture', revision: 7, startMeasure: 1, endMeasure: 2 };

test('Python input preserves written positions, ties and literal pitches without ABC reparse', () => {
  const data = prepareMusic21Input({ abcSource: 'X:1\nM:4/4\nL:1/4\nK:F\nB4- | B4 |]', startMeasure: 2, endMeasure: 2 });
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].pitch, 'Bb4');
  assert.equal(data.events[0].carryIn, true);
  assert.equal(data.events[0].measure, 2);
  assert.equal(data.events[0].offsetQuarterLength, '0');
  assert.equal(data.events[0].durationQuarterLength, '4');
  assert.equal(data.events[0].sourceEventIds.length, 2);
});

test('invalid ranges, oversized code and unsupported sandbox platforms fail closed', async () => {
  await assert.rejects(analyzeMusic21Python({ ...input, code: 'x'.repeat(16001) }), { code: 'INVALID_CODE' });
  await assert.rejects(analyzeMusic21Python({ ...input, code: 'result=1' }, { platform: 'win32' }), { code: 'MUSIC21_SANDBOX_UNAVAILABLE' });
  assert.throws(() => prepareMusic21Input({ abcSource, startMeasure: 1, endMeasure: 17 }), { code: 'INVALID_RANGE' });
});

test('real sandbox computes music21 evidence while blocking host files, credentials and network', { timeout: 30000 }, async (t) => {
  let runtime;
  try { runtime = await resolveMusic21Python(); } catch {
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') throw new Error('Required music21 runtime is unavailable');
    t.skip('Optional music21 runtime unavailable'); return;
  }
  if (process.platform !== 'linux') { t.skip('Bubblewrap isolation is Linux-specific'); return; }
  const home = await mkdtemp(join(tmpdir(), 'chorale-sandbox-proof-'));
  const secret = join(home, 'private.txt');
  await writeFile(secret, 'must remain outside the sandbox');
  try {
    const result = await analyzeMusic21Python({ ...input, code: [
      'import os, socket',
      'blocked = {}',
      `try:\n    open(${JSON.stringify(secret)}).read()\n    blocked["hostFile"] = False\nexcept OSError:\n    blocked["hostFile"] = True`,
      'try:\n    socket.create_connection(("1.1.1.1", 443), timeout=0.3)\n    blocked["network"] = False\nexcept OSError:\n    blocked["network"] = True',
      'blocked["environment"] = "CHORALE_PRIVATE_TEST_TOKEN" not in os.environ',
      'result = {"chords": [{"root": c.root().name, "quality": c.quality} for c in score.chordify().recurse().getElementsByClass("Chord")], "blocked": blocked}',
    ].join('\n') }, { runtime });
    assert.deepEqual(result.result.chords, [{ root: 'C', quality: 'major' }, { root: 'G', quality: 'major' }]);
    assert.deepEqual(result.result.blocked, { hostFile: true, network: true, environment: true });
    assert.equal(result.revision, 7);
    assert.equal(await readFile(secret, 'utf8'), 'must remain outside the sandbox');
    await assert.rejects(analyzeMusic21Python({ ...input, code: 'result=1' }, { runtime, bubblewrap: join(home, 'missing-bwrap') }), { code: 'MUSIC21_SANDBOX_UNAVAILABLE' });
    await assert.rejects(analyzeMusic21Python({ ...input, code: 'while True: pass' }, { runtime, timeoutMs: 2000 }), { code: 'MUSIC21_TIMEOUT' });
    const controller = new AbortController();
    const running = analyzeMusic21Python({ ...input, code: 'while True: pass' }, { runtime, signal: controller.signal });
    setTimeout(() => controller.abort(), 150);
    await assert.rejects(running, { code: 'MUSIC21_CANCELLED' });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('HTTP MCP exposes revision-bound music21 analysis without changing the score', { timeout: 20000 }, async t => {
  if (process.platform !== 'linux') { t.skip('Bubblewrap is Linux-specific'); return; }
  try { await resolveMusic21Python(); } catch {
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') throw new Error('Required music21 is unavailable');
    t.skip('Optional music21 unavailable'); return;
  }
  const home = await mkdtemp(join(tmpdir(), 'chorale-music21-http-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  const doc = await store.create({ title: 'Python evidence', abcSource });
  const running = await startServer({ port: 0, store });
  const client = new Client({ name: 'music21-http-proof', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`)));
    assert.ok((await client.listTools()).tools.some(tool => tool.name === 'analyze_music21'));
    const response = await client.callTool({ name: 'analyze_music21', arguments: {
      documentId: doc.id, expectedRevision: doc.revision, startMeasure: 1, endMeasure: 1,
      code: 'score.parts[0].recurse().notes[0].pitch.name = "G#"\nresult = {"events": len(events), "privatePitch": score.parts[0].recurse().notes[0].name}',
    } });
    assert.ok(!response.isError, JSON.stringify(response));
    assert.deepEqual(response.structuredContent.result, { events: 3, privatePitch: 'G#' });
    assert.equal(response.structuredContent.revision, doc.revision);
    assert.deepEqual(await store.require(doc.id), doc);
    const conflict = await client.callTool({ name: 'analyze_music21', arguments: {
      documentId: doc.id, expectedRevision: 999, code: 'result=1',
    } });
    assert.equal(conflict.structuredContent.errorCode, 'REVISION_CONFLICT');
  } finally {
    await client.close(); running.httpServer.closeAllConnections();
    await new Promise(resolve => running.httpServer.close(resolve));
    await running.mcpServer.close(); store.close();
    await rm(home, { recursive: true, force: true });
  }
});
