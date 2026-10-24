import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm, readlink, readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { Agent } from '@earendil-works/pi-agent-core';
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { analyzeMusic21Python } from '../server/music21-python.mjs';

const directory = resolve(process.argv[2] || 'docs/reviews/music21-python-2026-10-23');
await mkdir(directory, { recursive: true });
const cases = [
  {
    id: '01-inversions', title: 'Dominant inversion in C major', start: 1, end: 3,
    question: 'Which chord is inverted, and what is its bass?',
    abc: 'X:1\nT:Inversions\nM:4/4\nL:1/4\nK:C\n[CEG]4 | [B,DG]4 | [CEG]4 |]',
    code: 'result = [{"measure": c.measureNumber, "root": c.root().name, "bass": c.bass().name, "quality": c.quality, "inversion": c.inversion()} for c in score.chordify().recurse().getElementsByClass("Chord")]',
    verify: output => assert.deepEqual(output.result.map(c => [c.root, c.bass, c.inversion]), [['C', 'C', 0], ['G', 'B', 1], ['C', 'C', 0]]),
    explanation: 'The middle G-major sonority has B in the bass: first inversion. This is a sonority/inversion check, not an automatic functional or cadence judgment.',
  },
  {
    id: '02-parallel-fifths', title: 'Parallel fifths across two voices', start: 1, end: 2,
    question: 'Check the motion between the two voices for parallel fifths.',
    abc: 'X:1\nT:Parallel fifths\nM:4/4\nL:1/4\nK:C\nV:1 clef=treble\nG2 A2 | B2 c2 |]\nV:2 clef=bass\nC2 D2 | E2 F2 |]',
    code: 'upper = list(score.parts[0].recurse().notes)\nlower = list(score.parts[1].recurse().notes)\nresult = [{"fromMeasure": upper[i].measureNumber, "toMeasure": upper[i+1].measureNumber, "parallelFifth": music21.voiceLeading.VoiceLeadingQuartet(upper[i], upper[i+1], lower[i], lower[i+1]).parallelFifth()} for i in range(len(upper)-1)]',
    verify: output => assert.deepEqual(output.result.map(row => row.parallelFifth), [true, true, true]),
    explanation: 'All three successive voice pairs preserve a perfect fifth in similar motion. Whether to revise them depends on the intended style.',
  },
  {
    id: '03-pickup-accidental-tie', title: 'Pickup, chromatic pitch and carried tie', start: 0, end: 4,
    question: 'List the actual melody pitches and verify the pickup and final tie before suggesting revisions.',
    abc: 'X:1\nT:Pickup and tie\nM:3/4\nL:1/4\nK:Dm\nA | d2 e | f2 ^c | d3- | d3 |]',
    code: 'notes = list(score.parts[0].recurse().notes)\nresult = {"pitches": [n.nameWithOctave for n in notes], "writtenMeasures": [m["number"] for m in measures], "lastDuration": str(notes[-1].duration.quarterLength), "tieSourceCount": len(events[-1]["sourceEventIds"])}',
    verify: output => {
      assert.deepEqual(output.result.pitches, ['A4', 'D5', 'E5', 'F5', 'C#5', 'D5']);
      assert.deepEqual(output.result.writtenMeasures, [0, 1, 2, 3, 4]);
      assert.equal(output.result.lastDuration, '6.0'); assert.equal(output.result.tieSourceCount, 2);
    },
    explanation: 'The pickup remains written measure 0, the explicit C-sharp is preserved, and the tied final D lasts six quarter notes across written measures 3–4.',
  },
];
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const summaries = [];
try {
  const { createScoreSnapshot } = await vite.ssrLoadModule('/src/music/scoreSnapshot.ts');
  const { createSheetTools } = await vite.ssrLoadModule('/electron/ai/sheetTools.ts');
  const { SHEET_AGENT_SYSTEM_PROMPT } = await vite.ssrLoadModule('/electron/ai/systemPrompt.ts');
  const { JSONLAgentTraceStore } = await vite.ssrLoadModule('/electron/ai/agentTrace.ts');
  const traces = new JSONLAgentTraceStore(join(directory, 'traces'));
  for (const example of cases) {
    const snapshot = createScoreSnapshot({ snapshotId: example.id, documentId: example.id, revision: 1, abc: example.abc, annotations: [] });
    const trace = await traces.createRun(example.id);
    await trace.append('example-start', { title: example.title, provider: 'faux / simulated', liveModel: false,
      question: example.question, systemPrompt: SHEET_AGENT_SYSTEM_PROMPT, snapshot: { documentId: example.id, revision: 1, abc: example.abc }, code: example.code });
    let observed;
    const registry = createSheetTools(snapshot, { analyzeMusic21: async (payload, options) => {
      observed = await analyzeMusic21Python(payload, options); return observed;
    } });
    const faux = createFauxCore({ api: `review-${example.id}`, provider: `review-${example.id}`, models: [{ id: 'scripted-review' }] });
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('select_analysis_profile', { profiles: ['harmony', 'voice-leading'] }), { stopReason: 'toolUse' }),
      fauxAssistantMessage(fauxToolCall('read_measure_range', { startMeasure: example.start, endMeasure: example.end }), { stopReason: 'toolUse' }),
      fauxAssistantMessage(fauxToolCall('analyze_music21', { startMeasure: example.start, endMeasure: example.end, code: example.code }), { stopReason: 'toolUse' }),
      fauxAssistantMessage(example.explanation),
    ]);
    const agent = new Agent({ initialState: { systemPrompt: SHEET_AGENT_SYSTEM_PROMPT, model: faux.getModel(), tools: [...registry.tools] }, streamFn: faux.streamSimple });
    agent.subscribe(event => { void trace.append('agent-event', event); });
    try {
      await agent.prompt(example.question);
      assert.ok(observed, 'The real Python tool must have executed');
      example.verify(observed);
      assert.equal(snapshot.abc, example.abc);
      await trace.append('verification', { passed: true, output: observed, scoreUnchanged: true, tokenCost: 'No live model request; provider messages were scripted.' });
      await writeFile(join(directory, `${example.id}.abc`), example.abc + '\n');
      await writeFile(join(directory, `${example.id}.py`), example.code + '\n');
      await writeFile(join(directory, `${example.id}.json`), JSON.stringify({ title: example.title, question: example.question, code: example.code, output: observed, expectedInterpretation: example.explanation, messages: agent.state.messages }, null, 2) + '\n');
      summaries.push({ id: example.id, title: example.title, passed: true, engine: observed.engine, durationMs: observed.durationMs, explanation: example.explanation, trace: `traces/${basename(trace.filePath)}` });
      console.log(`${example.id}: passed (${observed.durationMs} ms, music21 ${observed.engine.version})`);
    } catch (error) {
      await trace.append('verification', { passed: false, error: error.message });
      throw error;
    } finally { await trace.close(); }
  }
  const scratch = await mkdtemp(join(tmpdir(), 'chorale-review-isolation-'));
  try {
    const file = join(scratch, 'private.txt');
    await writeFile(file, 'synthetic host-only data');
    const security = await analyzeMusic21Python({ abcSource: cases[0].abc, startMeasure: 1, endMeasure: 1, code:
      `import os, socket\nblocked = {}\ntry:\n    open(${JSON.stringify(file)}).read()\n    blocked['hostFile'] = False\nexcept OSError:\n    blocked['hostFile'] = True\ntry:\n    socket.create_connection(('1.1.1.1', 443), timeout=0.3)\n    blocked['network'] = False\nexcept OSError:\n    blocked['network'] = True\nresult = {'blocked': blocked, 'networkNamespace': os.readlink('/proc/self/ns/net')}` });
    assert.deepEqual(security.result.blocked, { hostFile: true, network: true });
    const hostNamespace = await readlink('/proc/self/ns/net');
    assert.notEqual(security.result.networkNamespace, hostNamespace);
    let timeout;
    try { await analyzeMusic21Python({ abcSource: cases[0].abc, code: 'while True: pass' }, { timeoutMs: 2000 }); }
    catch (error) { timeout = { code: error.code, message: error.message }; }
    assert.equal(timeout?.code, 'MUSIC21_TIMEOUT');
    await writeFile(join(directory, '04-isolation.json'), JSON.stringify({ security, hostNamespace, timeout, passed: true }, null, 2) + '\n');
  } finally { await rm(scratch, { recursive: true, force: true }); }
  const audits = [];
  for (const example of summaries) {
    const rows = (await readFile(join(directory, example.trace), 'utf8')).trim().split('\n').map(JSON.parse);
    rows.forEach((row, i) => assert.equal(row.sequence, i));
    const starts = rows.filter(row => row.data?.type === 'tool_execution_start');
    const ends = rows.filter(row => row.data?.type === 'tool_execution_end');
    assert.equal(rows[0].data.liveModel, false);
    assert.equal(rows.at(-1).data.passed, true);
    assert.deepEqual(starts.map(row => row.data.toolName), ['select_analysis_profile', 'read_measure_range', 'analyze_music21']);
    for (const start of starts) assert.equal(ends.find(row => row.data.toolCallId === start.data.toolCallId)?.data.isError, false);
    assert.equal(rows.at(-1).data.output.sandbox.syscalls, 'seccomp');
    assert.equal(rows[0].data.code + '\n', await readFile(join(directory, `${example.id}.py`), 'utf8'));
    audits.push({ trace: example.trace, records: rows.length, matchedToolIds: true, orderedSequences: true, fullCodeCaptured: true, providerSimulated: true, passed: true });
  }
  await writeFile(join(directory, 'trace-audit.json'), JSON.stringify({ audited: true, storage: 'local only; no cloud telemetry', checks: audits }, null, 2) + '\n');
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ provider: 'simulated', analysis: 'real sandboxed Python/music21', cases: summaries, isolationPassed: true }, null, 2) + '\n');
  await writeFile(join(directory, 'README.md'), [
    '# Sandboxed music21 review examples', '',
    'The Pi tool-calling conversations use scripted provider responses. The Python/music21 calls, Bubblewrap isolation, source extraction, tool validation and trace recording are real. No live-model quality or benchmark accuracy claim is made. No provider requests were made.', '',
    'Each example has the original ABC, exact Python snippet, tool result and complete conversation messages in JSON, plus an ordered JSONL trace under `traces/`. Revision 1 snapshots remain unchanged.', '',
    ...summaries.flatMap(item => [`## ${item.title}`, '', `Passed with music21 ${item.engine.version}, Python ${item.engine.pythonVersion}; ${item.durationMs} ms in the sandbox.`, '', item.explanation, '', `[Input score](${item.id}.abc) · [Python](${item.id}.py) · [Conversation and result](${item.id}.json) · [JSONL trace](${item.trace})`, '']),
    '## Isolation checks', '',
    'A synthetic host file and external connection were inaccessible. The worker ran in a different network namespace. An infinite loop was terminated by the wall-time limit. See [isolation evidence](04-isolation.json).', '',
    'All three saved traces were audited for complete inputs/code, ordered events, matching tool-call/result IDs and passing verification. See the [trace audit](trace-audit.json).', '',
    'These small examples verify the tool path and a few expected facts. They are not a musical-analysis benchmark. music21 results still need interpretation against the written score.', '',
    '## Full desktop conversation', '',
    'The companion Electron check uses the actual renderer, preload IPC, AIController, Pi Agent, bundled music21 tool and Python sandbox. Only the provider is replaced by a local scripted HTTP endpoint. See [desktop evidence](electron/result.json), [provider requests](electron/provider-requests.json), and the JSONL trace in `electron/`.', '',
    '![Electron conversation](electron/conversation.png)', '',
    'Reproduce after installing music21, Bubblewrap and libseccomp: `node scripts/music21-examples.mjs <output-directory>`. After building Electron, run `node scripts/electron-music21-smoke.mjs <output-directory>/electron` for the full desktop path. Restricted test runners can explicitly set `CHORALE_SMOKE_NO_SANDBOX=1` for Electron; Python analysis always retains its own OS sandbox.', '',
  ].join('\n'));
} finally { await vite.close(); }
