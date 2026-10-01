import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  MUSIC21_REQUIREMENT,
  MUSIC21_ANALYSIS_TIMEOUT_MS,
  MUSIC21_PROBE_TIMEOUT_MS,
  MUSIC21_TRANSPORT_TIMEOUT_MS,
  analyzeHarmonyWithMusic21,
  installMusic21,
  managedMusic21Paths,
  resolveMusic21Python,
  runProcess,
} from '../server/music21.mjs';
import { proxyDaemonTools, proxyDocumentMutations } from '../server/daemon-mutations.mjs';

const sampleAbc = `X:1
T:Cadence
M:4/4
L:1/4
K:C
V:1
[CEG]4 | [GBd]4 | [CEG]4 |]
`;

const runtimeForIntegration = async (t) => {
  try {
    const runtime = await resolveMusic21Python();
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') assert.equal(runtime.version, MUSIC21_REQUIREMENT.split('==')[1]);
    return runtime;
  } catch (error) {
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') throw error;
    t.skip('music21 is not installed in the optional-dependency test environment');
    return null;
  }
};

const stubRuntime = { command: '/managed/python', prefixArgs: [], source: 'managed', version: '9.9.1', pythonVersion: '3.12.3' };
const structuredInput = () => ({
  schemaVersion: 1,
  passageKey: 'C major',
  slices: [{
    sliceId: 'm1@0',
    position: { measure: 1, offsetQuarterLength: '0' },
    durationQuarterLength: '4',
    soundingPitches: ['C4', 'E4', 'G4'],
    literalBass: 'C4',
    localKey: 'C major',
  }],
});
const structuredReply = () => ({
  schemaVersion: 1,
  engine: { name: 'music21', version: '9.9.1' },
  estimatedPassageKey: 'C major',
  keySource: 'written',
  warning: 'Fallible deterministic evidence',
  slices: [{
    sliceId: 'm1@0',
    candidate: { localKey: 'C major', romanNumeral: 'I', root: 'C', quality: 'major', inversion: 'root', confidence: 0.35 },
  }],
});

test('music21 requirements pin the evaluated release', async () => {
  const requirements = await readFile(new URL('../server/python/requirements-music21.txt', import.meta.url), 'utf8');
  assert.equal(MUSIC21_REQUIREMENT, 'music21==9.9.1');
  assert.equal(requirements.trim(), MUSIC21_REQUIREMENT);
});

test('music21 resolver falls through unavailable interpreters and reports runtime details', async () => {
  const calls = [];
  const resolved = await resolveMusic21Python({
    candidates: [
      { command: '/missing/python', prefixArgs: [], source: 'managed' },
      { command: '/working/python', prefixArgs: [], source: 'system' },
    ],
    runProcess: async (command, args) => {
      calls.push({ command, args });
      if (command.includes('missing')) throw new Error('not found');
      return { code: 0, stdout: '{"music21":"9.9.1","python":"3.12.3"}\n', stderr: '' };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(resolved.command, '/working/python');
  assert.equal(resolved.version, '9.9.1');
  assert.equal(resolved.pythonVersion, '3.12.3');
});

test('music21 installer creates an isolated venv and installs the pinned requirements', async () => {
  const choraleHome = await mkdtemp(join(tmpdir(), 'chorale-music21-'));
  const calls = [];
  try {
    const installed = await installMusic21({
      choraleHome,
      bootstrapPython: '/usr/bin/python3',
      requirementsPath: '/package/requirements-music21.txt',
      runProcess: async (command, args) => {
        calls.push({ command, args });
        if (args.some((arg) => String(arg).includes('sys.version_info'))) {
          return { code: 0, stdout: '[3,12]\n', stderr: '' };
        }
        if (args.some((arg) => String(arg).includes('platform.python_version'))) {
          return { code: 0, stdout: '{"music21":"9.9.1","python":"3.12.3"}\n', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      },
    });

    const paths = managedMusic21Paths(choraleHome);
    assert.deepEqual(calls[1], {
      command: '/usr/bin/python3',
      args: ['-m', 'venv', paths.environment],
    });
    assert.equal(calls[2].command, paths.python);
    assert.deepEqual(calls[2].args, [
      '-m', 'pip', 'install', '--disable-pip-version-check', '--requirement', '/package/requirements-music21.txt',
    ]);
    assert.equal(installed.version, '9.9.1');
  } finally {
    await rm(choraleHome, { recursive: true, force: true });
  }
});

test('music21 analysis runner sends JSON over stdin and decorates engine metadata', async () => {
  let invocation;
  const payload = {
    schemaVersion: 1,
    passageKey: 'C major',
    slices: [{
      sliceId: 'm1@0',
      position: { measure: 1, offsetQuarterLength: '0' },
      durationQuarterLength: '4',
      soundingPitches: ['C4', 'E4', 'G4'],
      literalBass: 'C4',
      localKey: 'C major',
    }],
  };
  const analysis = await analyzeHarmonyWithMusic21(payload, {
    runtime: {
      command: '/managed/python',
      prefixArgs: [],
      source: 'managed',
      version: '9.9.1',
      pythonVersion: '3.12.3',
    },
    scriptPath: '/package/music21_harmony.py',
    runProcess: async (command, args, options) => {
      invocation = { command, args, options };
      return {
        code: 0,
        stdout: JSON.stringify({
          schemaVersion: 1,
          keySource: 'written',
          engine: { name: 'music21', version: '9.9.1' },
          estimatedPassageKey: 'C major',
          warning: 'fallible',
          slices: [{
            sliceId: 'm1@0',
            candidate: { localKey: 'C major', romanNumeral: 'I', root: 'C', quality: 'major', inversion: 'root', confidence: 0.8 },
          }],
        }),
        stderr: '',
      };
    },
  });

  assert.equal(invocation.command, '/managed/python');
  assert.deepEqual(invocation.args, ['/package/music21_harmony.py']);
  assert.deepEqual(JSON.parse(invocation.options.input), payload);
  assert.deepEqual(analysis.engine, {
    name: 'music21',
    version: '9.9.1',
    pythonVersion: '3.12.3',
    source: 'managed',
  });
  assert.equal(analysis.slices.length, 1);
  assert.equal(analysis.slices[0].candidate.root, 'C');
});

test('music21 Python helper emits onset-aligned score evidence when music21 is available', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const analysis = await analyzeHarmonyWithMusic21({ abcSource: sampleAbc, startMeasure: 1, endMeasure: 1 }, { runtime });
  assert.equal(analysis.engine.name, 'music21');
  assert.equal(analysis.estimatedPassageKey, 'C major');
  assert.equal(analysis.slices[0].position.measure, 1);
  assert.equal(analysis.slices[0].literalBass, 'C4');
  assert.equal(analysis.slices[0].candidate.root, 'C');
  assert.match(analysis.warning, /Fallible deterministic evidence/);
});

test('music21 Python helper produces non-empty evidence for a single measure', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const singleAbc = `X:1
T:Single Measure
M:4/4
L:1/4
K:C
[CEG]4 |
`;
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: singleAbc, startMeasure: 1, endMeasure: 1 }, { runtime });
  assert.equal(analysis.slices.length, 1);
  assert.equal(analysis.slices[0].position.measure, 1);
  assert.deepEqual(analysis.slices[0].soundingPitches, ['C4', 'E4', 'G4']);
  assert.equal(analysis.slices[0].literalBass, 'C4');
  assert.equal(analysis.slices[0].candidate.root, 'C');
});

test('music21 Python helper analyzes named voices (S/B) together rather than sequentially', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const sopranoBassAbc = `X:1
T:Chorale Voices
M:4/4
L:1/4
K:C
V:S clef=treble name="Soprano"
c4 | d4 |
V:B clef=bass name="Bass"
C4 | G,4 |
`;
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: sopranoBassAbc, startMeasure: 1, endMeasure: 2 }, { runtime });
  // Must be 2 measures of parallel sonorities, NOT 4 sequential measures
  assert.equal(analysis.slices.length, 2);
  assert.equal(analysis.slices[0].position.measure, 1);
  assert.deepEqual(analysis.slices[0].soundingPitches, ['C4', 'C5']);
  assert.equal(analysis.slices[0].literalBass, 'C4');

  assert.equal(analysis.slices[1].position.measure, 2);
  assert.deepEqual(analysis.slices[1].soundingPitches, ['G3', 'D5']);
  assert.equal(analysis.slices[1].literalBass, 'G3');
});

test('music21 Python helper correctly renders pitches in excerpts after key changes', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const gMajorExcerpt = `X:1
T:Excerpt in G
M:4/4
L:1/4
K:C
c4 | c4 |
K:G
f4 |]
`;
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: gMajorExcerpt, startMeasure: 3, endMeasure: 3 }, { runtime });
  assert.equal(analysis.slices.length, 1);
  assert.equal(analysis.slices[0].position.measure, 3);
  // In K:G, note f must sound as F#5, NOT F5
  assert.deepEqual(analysis.slices[0].soundingPitches, ['F#5']);
  assert.equal(analysis.slices[0].literalBass, 'F#5');
});

test('music21 Python helper correctly numbers measures and offsets for split repeat bars', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const splitRepeatAbc = `X:1
T:Split Repeat
M:4/4
L:1/4
K:C
c4 | d2 :|: d2 | e4 |
`;
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: splitRepeatAbc, startMeasure: 1, endMeasure: 3 }, { runtime });
  // Measure 1 (offset 0), Measure 2 (offset 0), Measure 2 (offset 2), Measure 3 (offset 0)
  assert.equal(analysis.slices.length, 4);
  assert.deepEqual(analysis.slices.map((s) => ({
    measure: s.position.measure,
    offset: s.position.offsetQuarterLength,
    pitch: s.soundingPitches[0],
  })), [
    { measure: 1, offset: '0', pitch: 'C5' },
    { measure: 2, offset: '0', pitch: 'D5' },
    { measure: 2, offset: '2', pitch: 'D5' },
    { measure: 3, offset: '0', pitch: 'E5' },
  ]);
});

test('music21 Python helper detects key changes inside selected passage and sets local candidate keys', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const intraPassageKeyAbc = `X:1
T:Intra-Passage Key Change
M:4/4
L:1/4
K:C
c4 | [K:G] f4 |
`;
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: intraPassageKeyAbc, startMeasure: 1, endMeasure: 2 }, { runtime });
  assert.equal(analysis.slices.length, 2);
  assert.equal(analysis.slices[0].position.measure, 1);
  assert.deepEqual(analysis.slices[0].soundingPitches, ['C5']);
  assert.equal(analysis.slices[0].candidate.localKey, 'C major');

  assert.equal(analysis.slices[1].position.measure, 2);
  // Note f in K:G sounds as F#5
  assert.deepEqual(analysis.slices[1].soundingPitches, ['F#5']);
  assert.equal(analysis.slices[1].candidate.localKey, 'G major');
  assert.match(analysis.slices[1].candidate.romanNumeral, /^vii/);
});

test('music21 Python helper isolates voice-specific key changes without altering other voices', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;

  const polytonalAbc = `X:1
T:Polytonal Voice Isolation
M:4/4
L:1/4
K:C
V:1
c4 | [K:G] f4 |
V:2 clef=bass
C4 | F4 |
`;
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: polytonalAbc, startMeasure: 1, endMeasure: 2 }, { runtime });
  assert.equal(analysis.slices.length, 2);
  assert.equal(analysis.slices[0].position.measure, 1);
  assert.deepEqual(analysis.slices[0].soundingPitches, ['C4', 'C5']);

  assert.equal(analysis.slices[1].position.measure, 2);
  // Soprano note f in K:G sounds as F#5, while Bass note F in K:C sounds as F4
  assert.deepEqual(analysis.slices[1].soundingPitches, ['F4', 'F#5']);
  assert.equal(analysis.slices[1].literalBass, 'F4');
});

test('music21 Python helper interprets structured chord slices via stdin', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;
  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  const result = await runProcess(runtime.command, [...runtime.prefixArgs, helper], {
    input: JSON.stringify({
      schemaVersion: 1,
      passageKey: 'C major',
      slices: [{
        sliceId: 'm1@0',
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'E4', 'G4'],
        literalBass: 'C4',
        localKey: 'C major',
      }],
    }),
  });
  const output = JSON.parse(result.stdout);
  assert.equal(output.slices.length, 1);
  assert.equal(output.slices[0].candidate.root, 'C');
  assert.equal(output.slices[0].candidate.romanNumeral, 'I');
  assert.equal(output.slices[0].candidate.quality, 'major');
});



test('music21 runner rejects malformed and mismatched interpreter output', async (t) => {
  const mutations = {
    'missing schema version': (reply) => { delete reply.schemaVersion; },
    'wrong schema version': (reply) => { reply.schemaVersion = 2; },
    'missing slices': (reply) => { delete reply.slices; },
    'missing result ID': (reply) => { delete reply.slices[0].sliceId; },
    'unexpected result ID': (reply) => { reply.slices[0].sliceId = 'm999@0'; },
    'missing result': (reply) => { reply.slices = []; },
    'extra result': (reply) => { reply.slices.push({ ...reply.slices[0], sliceId: 'm2@0' }); },
    'duplicate result ID': (reply) => { reply.slices.push(reply.slices[0]); },
    'missing candidate': (reply) => { delete reply.slices[0].candidate; },
    'null candidate': (reply) => { reply.slices[0].candidate = null; },
    'missing candidate field': (reply) => { delete reply.slices[0].candidate.quality; },
    'invalid confidence': (reply) => { reply.slices[0].candidate.confidence = 1.5; },
    'invalid inversion': (reply) => { reply.slices[0].candidate.inversion = 'fifth'; },
    'empty root': (reply) => { reply.slices[0].candidate.root = ''; },
    'extra candidate property': (reply) => { reply.slices[0].candidate.documentId = 'forged'; },
    'forged literal evidence': (reply) => { reply.slices[0].soundingPitches = ['D4']; },
    'forged position': (reply) => { reply.slices[0].position = { measure: 999, offsetQuarterLength: '0' }; },
    'forged document': (reply) => { reply.documentId = 'forged'; },
    'forged revision': (reply) => { reply.revision = 999; },
    'forged range': (reply) => { reply.range = { startMeasure: 999, endMeasure: 999 }; },
    'missing engine': (reply) => { delete reply.engine; },
    'forged engine source': (reply) => { reply.engine.source = 'forged'; },
    'invalid key source': (reply) => { reply.keySource = 'estimated'; },
    'inconsistent key source': (reply) => { reply.keySource = 'ambiguous'; },
    'invented local key': (reply) => { reply.slices[0].candidate.localKey = 'D major'; },
    'unknown key with invented Roman numeral': (reply) => { reply.slices[0].candidate.localKey = 'unknown'; },
    'wrong runtime version': (reply) => { reply.engine.version = '10.0.0'; },
    'invented passage key': (reply) => { reply.estimatedPassageKey = 'D major'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, async () => {
      const reply = structuredReply();
      mutate(reply);
      await assert.rejects(analyzeHarmonyWithMusic21(structuredInput(), {
        runtime: stubRuntime,
        runProcess: async () => ({ stdout: JSON.stringify(reply) }),
      }), { code: 'MUSIC21_INVALID_OUTPUT' });
    });
  }
  for (const stdout of ['not JSON', 'null', '[]', '42']) {
    await assert.rejects(analyzeHarmonyWithMusic21(structuredInput(), {
      runtime: stubRuntime, runProcess: async () => ({ stdout }),
    }), { code: 'MUSIC21_INVALID_OUTPUT' });
  }
});

test('music21 runner matches reordered IDs and retains only Node literal evidence', async () => {
  const input = structuredInput();
  input.slices.push({ ...input.slices[0], sliceId: 'm2@0', position: { measure: 2, offsetQuarterLength: '0' }, soundingPitches: ['D4', 'F4', 'A4'], literalBass: 'D4' });
  const reply = structuredReply();
  reply.slices.unshift({ sliceId: 'm2@0', candidate: { ...reply.slices[0].candidate, root: 'D', quality: 'minor', romanNumeral: 'ii' } });
  const analysis = await analyzeHarmonyWithMusic21(input, {
    runtime: stubRuntime, runProcess: async () => ({ stdout: JSON.stringify(reply) }),
  });
  assert.deepEqual(analysis.slices, input.slices.map(({ sliceId, localKey: _localKey, ...literal }) => ({
    ...literal, candidate: reply.slices.find((slice) => slice.sliceId === sliceId).candidate,
  })));
  // Equal-length duplicates must fail, rather than letting Map overwrite a result.
  reply.slices[1].sliceId = 'm2@0';
  await assert.rejects(analyzeHarmonyWithMusic21(input, {
    runtime: stubRuntime, runProcess: async () => ({ stdout: JSON.stringify(reply) }),
  }), { code: 'MUSIC21_INVALID_OUTPUT' });
});

test('music21 runner preserves empty all-rest evidence and rejects invented slices', async () => {
  const input = { schemaVersion: 1, passageKey: 'C major', slices: [] };
  const reply = structuredReply();
  reply.slices = [];
  const options = { runtime: stubRuntime, runProcess: async () => ({ stdout: JSON.stringify(reply) }) };
  assert.deepEqual((await analyzeHarmonyWithMusic21(input, options)).slices, []);
  reply.slices = structuredReply().slices;
  await assert.rejects(analyzeHarmonyWithMusic21(input, options), { code: 'MUSIC21_INVALID_OUTPUT' });
});

test('music21 runner fails closed when Python is unavailable', async () => {
  await assert.rejects(analyzeHarmonyWithMusic21(structuredInput(), {
    candidates: [{ command: '/definitely-missing-chorale-python', prefixArgs: [], source: 'environment' }],
  }), (error) => error.code === 'MUSIC21_UNAVAILABLE' && /chorale setup music21/.test(error.message));
});

test('music21 runner rejects invalid input before launching a helper', async () => {
  for (const mutate of [
    (input) => { input.schemaVersion = 2; },
    (input) => { input.slices.push(input.slices[0]); },
    (input) => { delete input.slices[0].localKey; },
    (input) => { input.slices[0].durationQuarterLength = '0'; },
    (input) => { input.slices[0].soundingPitches = ['arbitrary']; },
  ]) {
    const input = structuredInput();
    mutate(input);
    await assert.rejects(analyzeHarmonyWithMusic21(input, {
      runtime: stubRuntime, runProcess: async () => assert.fail('Invalid input must not launch Python'),
    }), { code: 'MUSIC21_INVALID_INPUT' });
  }
});

test('music21 subprocess bounds output, enforces deadlines, and handles failed processes', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(1024))'], { maxOutputBytes: 64 }), { code: 'MUSIC21_OUTPUT_TOO_LARGE' });
  await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 30 }), { code: 'MUSIC21_TIMEOUT' });
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stderr.write("helper failed"); process.exit(2)']), /helper failed/);
});

test('music21 subprocess catches asynchronous stdin EPIPE without an unhandled error', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let killed = false;
  child.kill = () => { killed = true; };
  const result = runProcess('fake-python', [], {
    input: 'input',
    spawnImpl: () => {
      setImmediate(() => child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })));
      return child;
    },
  });
  await assert.rejects(result, { code: 'MUSIC21_ANALYSIS_FAILED' });
  assert.equal(killed, true);
});

test('stdio harmony deadline covers resolution plus analysis without extending mutation deadlines', async (t) => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => { deadlines.push(ms); return new AbortController().signal; });
  const fetchImpl = async () => new Response('{}');
  const proxied = proxyDaemonTools({ analyze_harmony() {}, read_measure() {}, create_new_file() {} }, 1685, fetchImpl);
  await proxied.analyze_harmony({});
  await proxied.read_measure({});
  await proxied.create_new_file({});
  await proxyDocumentMutations({}, 1685, fetchImpl).create_new_file({});
  assert.ok(MUSIC21_TRANSPORT_TIMEOUT_MS > 5 * MUSIC21_PROBE_TIMEOUT_MS + MUSIC21_ANALYSIS_TIMEOUT_MS);
  assert.deepEqual(deadlines, [MUSIC21_TRANSPORT_TIMEOUT_MS, 10_000, 10_000, 10_000]);
});

test('music21 Python preserves ambiguous keys and explicit modes', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;
  for (const localKey of [null, 'unknown', 'D dorian', 'E phrygian', 'F lydian', 'G mixolydian', 'A aeolian', 'B locrian', 'C ionian', 'Bb major']) {
    const input = structuredInput();
    input.passageKey = localKey;
    input.slices[0].localKey = localKey;
    const result = await analyzeHarmonyWithMusic21(input, { runtime });
    const ambiguous = localKey === null || localKey === 'unknown';
    assert.equal(result.keySource, ambiguous ? 'ambiguous' : 'written');
    assert.equal(result.estimatedPassageKey, ambiguous ? null : localKey);
    assert.equal(result.slices[0].candidate.localKey, ambiguous ? 'unknown' : localKey);
    if (ambiguous) assert.equal(result.slices[0].candidate.romanNumeral, 'unknown');
    assert.equal(result.slices[0].candidate.root, 'C');
    assert.equal(result.slices[0].candidate.quality, 'major');
  }
});

test('music21 Python does not use passage key to replace unknown local context', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;
  const input = structuredInput();
  input.slices[0].localKey = null;
  const result = await analyzeHarmonyWithMusic21(input, { runtime });
  assert.equal(result.estimatedPassageKey, 'C major');
  assert.equal(result.keySource, 'written');
  assert.equal(result.slices[0].candidate.localKey, 'unknown');
  assert.equal(result.slices[0].candidate.romanNumeral, 'unknown');
});

test('music21 Python interprets negative-octave pitches without converting the octave sign into a flat', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;
  const input = structuredInput();
  input.slices[0].soundingPitches = ['C-1', 'E-1', 'G-1'];
  input.slices[0].literalBass = 'C-1';
  const result = await analyzeHarmonyWithMusic21(input, { runtime });
  assert.deepEqual(result.slices[0].soundingPitches, ['C-1', 'E-1', 'G-1']);
  assert.equal(result.slices[0].literalBass, 'C-1');
  assert.equal(result.slices[0].candidate.root, 'C');
  assert.equal(result.slices[0].candidate.quality, 'major');
  assert.equal(result.slices[0].candidate.romanNumeral, 'I');
});

test('music21 Python helper rejects unversioned or malformed direct payloads', async (t) => {
  const runtime = await runtimeForIntegration(t);
  if (!runtime) return;
  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  for (const mutate of [
    (input) => { delete input.schemaVersion; },
    (input) => { input.schemaVersion = 2; },
    (input) => { input.slices.push(input.slices[0]); },
    (input) => { input.slices[0].position.measure = true; },
    (input) => { delete input.slices[0].localKey; },
  ]) {
    const input = structuredInput();
    mutate(input);
    await assert.rejects(runProcess(runtime.command, [...runtime.prefixArgs, helper], {
      input: JSON.stringify(input),
    }), /music21 analysis failed:/);
  }
});
