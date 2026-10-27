import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { analyzeMusic21Python, prepareMusic21Input } from '../server/music21-python.mjs';
import { resolveMusic21Python } from '../server/music21.mjs';
import { createSheetManagementTools } from '../server/mcp/tools/sheet-management.mjs';
import { LocalDocumentStore } from '../server/store.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startServer } from '../server/api_server.mjs';

const score = (parts) => 'X:1\nM:4/4\nL:1/4\nK:C\n' + Object.entries(parts).map(([id, notes]) => `V:${id}\n${notes} |]`).join('\n');
const facts = result => result.findings.map(({ rule, voices, from, to, pitches, intervals, motion }) => ({ rule, voices, from, to, pitches, intervals, motion }));
const pos = (measure, offset) => ({ measure, offsetQuarterLength: String(offset) });

test('adapter preserves repeat and ending boundaries without changing authoritative event facts', () => {
  const input = prepareMusic21Input({ abcSource: score({ S: 'G4 |: A4 :| B4' }), startMeasure: 1, endMeasure: 3 });
  assert.deepEqual(input.boundaries, [{ offsetQuarterLength: '4' }, { offsetQuarterLength: '8' }]);
  assert.deepEqual(input.events.map(e => [e.pitch, e.measure, e.offsetQuarterLength]), [['G4', 1, '0'], ['A4', 2, '4'], ['B4', 3, '8']]);
});

test('real sandbox core checks: exact located facts, negative controls, coverage and immutable helper input', { timeout: 90000 }, async t => {
  let runtime;
  try { runtime = await resolveMusic21Python(); } catch {
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') throw new Error('Required music21 runtime unavailable');
    t.skip('Optional music21 runtime unavailable'); return;
  }
  if (process.platform !== 'linux') { t.skip('Existing Python sandbox requires Linux'); return; }
  const run = async (abcSource, code, endMeasure = 1, startMeasure = 1) => (await analyzeMusic21Python({ abcSource, code, startMeasure, endMeasure }, { runtime })).result;
  const onlyParallels = "result=analyze(checks=['parallels'])";
  const abc = score({ S: 'G2 A2', B: 'C,2 D,2' });
  const result = await run(abc, onlyParallels);
  assert.deepEqual(facts(result), [{ rule: 'parallel-fifth', voices: ['B', 'S'], from: pos(1, 0), to: pos(1, 2),
    pitches: ['C3', 'G4', 'D3', 'A4'], intervals: ['P-12', 'P-12'], motion: 'similar' }]);
  assert.equal(result.coverage.complete, true);
  assert.equal(result.findings[0].sourceEventIds.length, 4);
  assert.match(result.findings[0].id, /^vl-[a-f0-9]{24}$/);
  assert.deepEqual(await run(abc, onlyParallels), result);
  assert.deepEqual(await run(abc, "events.clear()\nresult=analyze(checks=['parallels'])"), result);

  for (const [label, parts] of [
    ['oblique', { S: 'G2 G2', B: 'C,2 D,2' }],
    ['contrary', { S: 'c2 B2', B: 'C2 D2' }],
    ['rest gap', { S: 'G z A2', B: 'C, z D,2' }],
    ['perfect to diminished', { S: 'G2 _A2', B: 'C2 D2' }],
    ['unison', { S: 'C2 D2', B: 'C2 D2' }],
  ]) assert.deepEqual((await run(score(parts), onlyParallels)).findings, [], label);
  const octaves = await run(score({ S: 'c2 d2', B: 'C2 D2' }), onlyParallels);
  assert.equal(octaves.findings[0].rule, 'parallel-octave');
  const held = await run(score({ S: 'G4- | G2 A2', B: 'C,4 | D,2 E,2' }), onlyParallels, 2);
  assert.equal(held.findings.length, 0, 'a tie is not an independent reattack');

  const crossing = await run(score({ S: 'E2 C2', A: 'C2 E2' }), "result=analyze(checks=['crossing','overlap'], voice_order=['S','A'])");
  assert.deepEqual(crossing.findings.map(f => [f.rule, f.from, f.to]), [
    ['crossing', pos(1, 2), pos(1, 2)],
  ]);
  const overlap = await run(score({ S: 'G2 c2', A: 'E2 A2' }), "result=analyze(checks=['crossing','overlap'], voice_order=['S','A'])");
  assert.deepEqual(overlap.findings.map(f => f.rule), ['overlap']);
  const orderless = await run(abc, "result=analyze(checks=['crossing'])");
  assert.equal(orderless.coverage.complete, false);
  assert.equal(orderless.diagnostics[0].code, 'VOICE_ORDER_REQUIRED');

  const satb = await run(score({ S: "b4", A: 'C4', T: 'G,4', B: 'C,4' }), "result=analyze(checks=['spacing','ranges'], voice_order=['S','A','T','B'], profile='chorale')");
  assert.deepEqual(satb.findings.map(f => [f.rule, f.voices, f.pitches]), [
    ['range', ['S'], ['B5']], ['spacing', ['S', 'A'], ['B5', 'C4']],
  ]);
  const melodic = await run(score({ S: 'C ^D E c\'' }), "result=analyze(checks=['melodic'])");
  assert.deepEqual(melodic.findings.map(f => [f.rule, f.intervals]), [
    ['melodic-altered-interval', ['A2']], ['melodic-large-leap', ['m13']],
  ]);
  const chordal = await run(score({ S: '[CE]2 [DF]2', B: 'C,2 D,2' }), onlyParallels);
  assert.deepEqual(chordal.coverage.excludedVoices, ['S']);
  assert.equal(chordal.coverage.complete, false);
  const repeated = await run(score({ S: 'G4 |: A4 :| B4', B: 'C,4 |: D,4 :| E,4' }), onlyParallels, 3);
  assert.deepEqual(repeated.findings, []);
  assert.equal(repeated.diagnostics.length, 2);
  assert.equal(repeated.coverage.skippedTransitions, 2);
  const capped = await run(score({ S: 'G A B c', B: 'C, D, E, F,' }), "result=analyze(checks=['parallels'], max_findings=1)");
  assert.equal(capped.totalFindings, 3);
  assert.equal(capped.findings.length, 1);
  assert.equal(capped.truncated, true);
  assert.equal(capped.coverage.complete, false);
  for (const code of ["result=analyze(checks=['oops'])", "result=analyze(voice_order=['S','S'])", 'result=analyze(max_findings=0)']) {
    await assert.rejects(run(abc, code), { code: 'MUSIC21_CODE_FAILED' });
  }
  const carry = await run(score({ S: 'G4- | G4', B: 'C,4 | D,4' }), onlyParallels, 2, 2);
  assert.deepEqual(carry.findings, []);
  const transposed = await run(abc.replace('V:S', 'V:S transpose=2').replace('V:B', 'V:B transpose=2'), onlyParallels);
  assert.deepEqual(transposed.findings[0].pitches, ['D3', 'A4', 'E3', 'B4']);
  const silence = await run(score({ S: 'z4' }), onlyParallels);
  assert.equal(silence.coverage.complete, false);
  assert.equal(silence.diagnostics[0].code, 'NO_PITCHED_EVENTS');
});

test('core results match exactly through HTTP and the stdio daemon proxy', { timeout: 30000 }, async t => {
  try { await resolveMusic21Python(); } catch {
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') throw new Error('Required music21 unavailable');
    t.skip('Optional music21 unavailable'); return;
  }
  if (process.platform !== 'linux') { t.skip('Existing sandbox requires Linux'); return; }
  const home = await mkdtemp(join(tmpdir(), 'chorale-core-mcp-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  const abcSource = score({ S: 'G2 A2', B: 'C,2 D,2' });
  const doc = await store.create({ title: 'Core parity', abcSource });
  const running = await startServer({ port: 0, store });
  const http = new Client({ name: 'core-http', version: '1' });
  const stdio = new Client({ name: 'core-stdio', version: '1' });
  try {
    await http.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`)));
    await stdio.connect(new StdioClientTransport({ command: process.execPath,
      args: ['--input-type=module', '--eval', `import { runCli } from './server/cli.mjs'; await runCli({ args: ['mcp'], port: ${running.port} });`],
      cwd: process.cwd(), env: { ...process.env, CHORALE_HOME: home, CHORALE_SKIP_CLIENT_SETUP: '1' },
    }));
    const args = { documentId: doc.id, expectedRevision: doc.revision, startMeasure: 1, endMeasure: 1,
      code: "result=analyze(checks=['parallels'], voice_order=['S','B'])" };
    const direct = await analyzeMusic21Python({ abcSource, code: args.code, startMeasure: 1, endMeasure: 1 });
    for (const client of [http, stdio]) {
      assert.equal((await client.listTools()).tools.filter(tool => tool.name === 'analyze_music21').length, 1);
      const response = await client.callTool({ name: 'analyze_music21', arguments: args });
      assert.ok(!response.isError, JSON.stringify(response));
      assert.deepEqual(response.structuredContent.result, direct.result);
      assert.equal(response.structuredContent.revision, doc.revision);
    }
    assert.deepEqual(await store.require(doc.id), doc);
  } finally {
    await http.close(); await stdio.close();
    running.httpServer.closeAllConnections();
    await new Promise(resolve => running.httpServer.close(resolve));
    await running.mcpServer.close(); store.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('same public analysis tool forwards core code and keeps revision validation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-core-transport-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  try {
    const doc = await store.create({ title: 'Core', abcSource: score({ S: 'G2 A2', B: 'C,2 D,2' }) });
    const seen = [];
    const registry = createSheetManagementTools(store, {}, { analyzeMusic21: async input => { seen.push(input); return { result: { checked: true } }; } });
    const code = "result=analyze(checks=['parallels'])";
    const response = await registry.handlers.analyze_music21({ documentId: doc.id, expectedRevision: doc.revision, startMeasure: 1, endMeasure: 1, code });
    assert.equal(response.isError, undefined);
    assert.equal(seen[0].code, code);
    assert.equal(seen[0].revision, doc.revision);
    assert.equal((await store.require(doc.id)).revision, doc.revision);
    const stale = await registry.handlers.analyze_music21({ documentId: doc.id, expectedRevision: 999, code });
    assert.equal(stale.structuredContent.errorCode, 'REVISION_CONFLICT');
    assert.equal(seen.length, 1);
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});
