import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  MUSIC21_REQUIREMENT,
  analyzeHarmonyWithMusic21,
  installMusic21,
  managedMusic21Paths,
  resolveMusic21Python,
  runProcess,
} from '../server/music21.mjs';

const sampleAbc = `X:1
T:Cadence
M:4/4
L:1/4
K:C
V:1
[CEG]4 | [GBd]4 | [CEG]4 |]
`;

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
  const analysis = await analyzeHarmonyWithMusic21({ abcSource: sampleAbc, startMeasure: 4 }, {
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
          engine: { name: 'music21', version: '9.9.1' },
          estimatedPassageKey: 'C major',
          warning: 'fallible',
          slices: [],
        }),
        stderr: '',
      };
    },
  });

  assert.equal(invocation.command, '/managed/python');
  assert.deepEqual(invocation.args, ['/package/music21_harmony.py']);
  assert.deepEqual(JSON.parse(invocation.options.input), { abcSource: sampleAbc, startMeasure: 4 });
  assert.deepEqual(analysis.engine, {
    name: 'music21',
    version: '9.9.1',
    pythonVersion: '3.12.3',
    source: 'managed',
  });
});

test('music21 Python helper emits onset-aligned score evidence when music21 is available', async (t) => {
  let runtime;
  try {
    runtime = await resolveMusic21Python();
  } catch {
    t.skip('music21 is not installed in the test environment');
    return;
  }

  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  const result = await runProcess(runtime.command, [...runtime.prefixArgs, helper], {
    input: JSON.stringify({ abcSource: sampleAbc, startMeasure: 1 }),
  });
  const analysis = JSON.parse(result.stdout);
  assert.equal(analysis.engine.name, 'music21');
  assert.equal(analysis.estimatedPassageKey, 'C major');
  assert.equal(analysis.slices[0].position.measure, 1);
  assert.equal(analysis.slices[0].literalBass, 'C4');
  assert.equal(analysis.slices[0].candidate.root, 'C');
  assert.match(analysis.warning, /Fallible deterministic evidence/);
});

test('music21 Python helper produces non-empty evidence for a single measure', async (t) => {
  let runtime;
  try {
    runtime = await resolveMusic21Python();
  } catch {
    t.skip('music21 is not installed in the test environment');
    return;
  }

  const singleAbc = `X:1
T:Single Measure
M:4/4
L:1/4
K:C
[CEG]4 |
`;
  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  const result = await runProcess(runtime.command, [...runtime.prefixArgs, helper], {
    input: JSON.stringify({ abcSource: singleAbc, startMeasure: 4 }),
  });
  const analysis = JSON.parse(result.stdout);
  assert.equal(analysis.slices.length, 1);
  assert.equal(analysis.slices[0].position.measure, 4);
  assert.deepEqual(analysis.slices[0].soundingPitches, ['C4', 'E4', 'G4']);
  assert.equal(analysis.slices[0].literalBass, 'C4');
  assert.equal(analysis.slices[0].candidate.root, 'C');
});

test('music21 Python helper analyzes named voices (S/B) together rather than sequentially', async (t) => {
  let runtime;
  try {
    runtime = await resolveMusic21Python();
  } catch {
    t.skip('music21 is not installed in the test environment');
    return;
  }

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
  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  const result = await runProcess(runtime.command, [...runtime.prefixArgs, helper], {
    input: JSON.stringify({ abcSource: sopranoBassAbc, startMeasure: 1 }),
  });
  const analysis = JSON.parse(result.stdout);
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
  let runtime;
  try {
    runtime = await resolveMusic21Python();
  } catch {
    t.skip('music21 is not installed in the test environment');
    return;
  }

  const gMajorExcerpt = `X:1
T:Excerpt in G
M:4/4
L:1/4
K:G
f4 |]
`;
  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  const result = await runProcess(runtime.command, [...runtime.prefixArgs, helper], {
    input: JSON.stringify({ abcSource: gMajorExcerpt, startMeasure: 3 }),
  });
  const analysis = JSON.parse(result.stdout);
  assert.equal(analysis.slices.length, 1);
  assert.equal(analysis.slices[0].position.measure, 3);
  // In K:G, note f must sound as F#5, NOT F5
  assert.deepEqual(analysis.slices[0].soundingPitches, ['F#5']);
  assert.equal(analysis.slices[0].literalBass, 'F#5');
});

test('music21 Python helper correctly numbers measures and offsets for split repeat bars', async (t) => {
  let runtime;
  try {
    runtime = await resolveMusic21Python();
  } catch {
    t.skip('music21 is not installed in the test environment');
    return;
  }

  const splitRepeatAbc = `X:1
T:Split Repeat
M:4/4
L:1/4
K:C
c4 | d2 :|: d2 | e4 |
`;
  const helper = join(process.cwd(), 'server', 'python', 'music21_harmony.py');
  const result = await runProcess(runtime.command, [...runtime.prefixArgs, helper], {
    input: JSON.stringify({ abcSource: splitRepeatAbc, startMeasure: 1 }),
  });
  const analysis = JSON.parse(result.stdout);
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

