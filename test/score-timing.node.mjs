import test from 'node:test';
import assert from 'node:assert/strict';
import abcjs from 'abcjs';
import {
  createRational, fromNumber, addRational, subRational, compareRational, rationalToText,
  buildScoreTiming, computeScoreMeasureMapping,
} from '../shared/score-timing.mjs';

const parse = (body, meter = '4/4', length = '1/4') => abcjs.parseOnly(`X:1\nM:${meter}\nL:${length}\nK:C\n${body}`)[0];
const timing = (...args) => buildScoreTiming(parse(...args));
const notes = (voice) => voice.entries.filter(({ element }) => element.el_type === 'note');
const positions = (voice) => notes(voice).map((entry) => [entry.measure,
  rationalToText(entry.offset), rationalToText(entry.absoluteOffset), rationalToText(entry.duration)]);
const intervals = (score) => score.measures.map(({ measure, start, duration }) =>
  [measure, rationalToText(start), rationalToText(duration)]);

test('rational helpers reduce, preserve thirds, reject unsafe or unrepresentable input', () => {
  assert.deepEqual(createRational(6, -9), { num: -2, den: 3 });
  assert.deepEqual(fromNumber(1 / 3), { num: 1, den: 3 });
  assert.deepEqual(fromNumber(-2 / 3), { num: -2, den: 3 });
  assert.deepEqual(addRational(fromNumber(1 / 3), fromNumber(2 / 3)), { num: 1, den: 1 });
  assert.deepEqual(subRational(createRational(1), createRational(3, 2)), { num: -1, den: 2 });
  assert.equal(compareRational(createRational(Number.MAX_SAFE_INTEGER, 2), createRational(Number.MAX_SAFE_INTEGER - 2, 2)), 1);
  assert.throws(() => createRational(0.5), /safe integers/);
  assert.throws(() => createRational(1, 0), /zero/);
  assert.throws(() => createRational(Number.MAX_SAFE_INTEGER + 1), /safe integers/);
  assert.throws(() => addRational(createRational(Number.MAX_SAFE_INTEGER), createRational(1)), /safe integer range/);
  assert.throws(() => fromNumber(Infinity), /finite/);
  assert.throws(() => fromNumber(Math.PI, 10), /denominator limit/);
});

test('leading empty repeats retain events without advancing written measures', () => {
  const score = timing('|: c4 | d4 |');
  assert.deepEqual(score.mapping.barToMeasure, [1, 2]);
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '4'], [2, '0', '4', '4']]);
  assert.equal(score.voices[0].entries[0].element.el_type, 'bar');
  assert.equal(score.voices[0].entries[0].measure, 1);
  assert.equal(rationalToText(score.voices[0].entries[0].duration), '0');
});

test('pickup detection and absolute timing span layout lines across all voices', () => {
  const score = timing('V:1\nG |\nc4 |\nd4 |\nV:2\nE |\nC4 |\nD4 |');
  assert.equal(score.mapping.isPickup, true);
  assert.equal(score.mapping.firstMeasureNumber, 0);
  assert.equal(score.mapping.totalMeasures, 2);
  assert.deepEqual(intervals(score), [[0, '0', '1'], [1, '1', '4'], [2, '5', '4']]);
  assert.equal(score.voices.length, 2);
  for (const voice of score.voices) {
    assert.deepEqual(positions(voice), [[0, '0', '0', '1'], [1, '0', '1', '4'], [2, '0', '5', '4']]);
    assert.equal(new Set(notes(voice).map((entry) => entry.segmentIndex)).size, 3);
  }
});

test('split repeats across layout lines have one written measure and exact continuation offsets', () => {
  const score = timing('c4 | d2 :|:\nd2 | e4 |');
  assert.deepEqual(score.mapping.barToMeasure, [1, 2, 2, 3]);
  assert.deepEqual([...score.mapping.measureToBars], [[1, [0]], [2, [1, 2]], [3, [3]]]);
  assert.deepEqual([...score.mapping.splitMeasures], [2]);
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '4'], [2, '0', '4', '2'], [2, '2', '6', '2'], [3, '0', '8', '4']]);
});

test('a split repeat in one voice does not shift a parallel unsplit voice', () => {
  const score = timing('V:1\nc4 | d2 :|: d2 | e4 |\nV:2\nC4 | D4 | E4 |');
  assert.deepEqual(score.voices.map((voice) => voice.barToMeasure), [[1, 2, 2, 3], [1, 2, 3]]);
  assert.deepEqual(positions(score.voices[1]), [[1, '0', '0', '4'], [2, '0', '4', '4'], [3, '0', '8', '4']]);
  assert.deepEqual(intervals(score), [[1, '0', '4'], [2, '4', '4'], [3, '8', '4']]);
});

test('multi-rests expand virtual bars and preserve following note and original element identity', () => {
  const tune = parse('Z4 | c4 |');
  const score = buildScoreTiming(tune);
  assert.deepEqual(score.mapping.barToMeasure, [1, 2, 3, 4, 5]);
  assert.equal(score.mapping.totalMeasures, 5);
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '4'], [2, '0', '4', '4'], [3, '0', '8', '4'], [4, '0', '12', '4'], [5, '0', '16', '4']]);
  const rests = notes(score.voices[0]).slice(0, 4);
  assert.ok(rests.every((entry) => entry.element === rests[0].element));
  assert.deepEqual(computeScoreMeasureMapping(tune).barToMeasure, [1, 2, 3, 4, 5]);
  assert.deepEqual(positions(timing('Z4 c4 |').voices[0]), positions(score.voices[0]));
  assert.deepEqual(positions(timing('X4 | c4 |').voices[0]), positions(score.voices[0]));
});

test('multi-rests use active meter and align with separately written bars in another voice', () => {
  const score = timing('V:1\nZ4 | c3 |\nV:2\nC3 | D3 | E3 | F3 | G3 |', '3/4');
  assert.deepEqual(intervals(score), [[1, '0', '3'], [2, '3', '3'], [3, '6', '3'], [4, '9', '3'], [5, '12', '3']]);
  assert.equal(notes(score.voices[0]).at(-1).measure, 5);
  assert.equal(rationalToText(notes(score.voices[1]).at(-1).absoluteOffset), '12');
});

test('meter changes and final unterminated partial measures retain real boundaries', () => {
  const score = timing('c3 |\n[M:2/4] d2 | e', '3/4');
  assert.deepEqual(intervals(score), [[1, '0', '3'], [2, '3', '2'], [3, '5', '1']]);
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '3'], [2, '0', '3', '2'], [3, '0', '5', '1']]);
  assert.ok(score.voices[0].entries.some(({ element, measure, duration }) =>
    element.el_type === 'meter' && measure === 2 && duration.num === 0));
});

test('tuplet arithmetic retains exact thirds with no fixed-grid quantization', () => {
  const score = timing('(3CDE F2 G2 A2 |', '4/4', '1/8');
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '1/3'], [1, '1/3', '1/3', '1/3'], [1, '2/3', '2/3', '1/3'], [1, '1', '1', '1'], [1, '2', '2', '1'], [1, '3', '3', '1']]);
  assert.deepEqual(intervals(score), [[1, '0', '4']]);
});

test('carry-in notes keep their releases without lengthening a written meter grid', () => {
  const score = timing('V:1\nc4 | d4 |\nV:2\nC6 |');
  assert.deepEqual(intervals(score), [[1, '0', '4'], [2, '4', '4']]);
  assert.deepEqual(positions(score.voices[1]), [[1, '0', '0', '6']]);
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '4'], [2, '0', '4', '4']]);
});

test('staggered written voice lengths choose the complete measure map and never reset by line', () => {
  const source = 'X:1\nM:4/4\nL:1/4\nK:C\nV:1\nc4 |\nd4 |\nV:2\nC4 |\nD4 |\nE4 |';
  const secondVoiceStart = source.indexOf('V:2');
  const score = buildScoreTiming(abcjs.parseOnly(source)[0], {
    voiceIdFor: (voice) => voice.find((element) => typeof element.startChar === 'number').startChar > secondVoiceStart ? 'B' : 'S',
  });
  assert.equal(score.mapping.totalMeasures, 3);
  assert.deepEqual(score.mapping.barToMeasure, [1, 2, 3]);
  assert.equal(notes(score.voices[1]).at(-1).measure, 3);
  assert.deepEqual(computeScoreMeasureMapping(abcjs.parseOnly(source)[0], {
    voiceIdFor: (voice) => voice.find((element) => typeof element.startChar === 'number').startChar > secondVoiceStart ? 'B' : 'S',
  }).barToMeasure, [1, 2, 3]);
});

test('raw key/clef metadata, voice IDs, and element objects remain available to pitch resolvers', () => {
  const tune = parse('c4 | [K:G clef=bass] D4 |');
  const score = buildScoreTiming(tune, { voiceIdFor: (_voice, slot) => `part-${slot}` });
  assert.equal(score.voices[0].voiceId, 'part-0');
  assert.ok(score.voices[0].entries.some(({ element }) => element.el_type === 'key'));
  assert.ok(score.voices[0].entries.some(({ element }) => element.el_type === 'clef'));
  assert.ok(score.voices[0].entries[0].staffKey);
  assert.ok(score.voices[0].entries[0].staffClef);
  assert.ok(score.voices[0].entries[0].staffMeter);
});

test('incompatible simultaneous meters fail explicitly rather than guessing alignment', () => {
  const score = { lines: [{ staff: [
    { meter: { type: 'specified', value: [{ num: '3', den: '4' }] }, voices: [[{ el_type: 'note', duration: 0.75 }]] },
    { meter: { type: 'specified', value: [{ num: '4', den: '4' }] }, voices: [[{ el_type: 'note', duration: 1 }]] },
  ] }] };
  assert.throws(() => buildScoreTiming(score), (error) => error.code === 'UNSUPPORTED_POLYMETER');
});

test('staff-level meter changes persist on subsequent layout lines', () => {
  const score = timing('c4 |\nM:3/4\nd3 |\ne3 |');
  assert.deepEqual(intervals(score), [[1, '0', '4'], [2, '4', '3'], [3, '7', '3']]);
  assert.equal(notes(score.voices[0]).at(-1).staffMeter.value[0].num, '3');
});

test('layout spacers retain zero-duration metadata without advancing time or bars', () => {
  const score = timing('C2 y2 D2 |');
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '2'], [1, '2', '2', '0'], [1, '2', '2', '2']]);
  assert.deepEqual(intervals(score), [[1, '0', '4']]);
  const leading = timing('y2 | C4 |');
  assert.deepEqual(leading.mapping.barToMeasure, [1]);
  assert.equal(notes(leading.voices[0]).at(-1).measure, 1);
  assert.equal(rationalToText(notes(leading.voices[0]).at(-1).offset), '0');
});

test('layout spacers neither apply nor consume tuplet state', () => {
  const score = timing('(3C y2 D E F |');
  assert.deepEqual(positions(score.voices[0]), [[1, '0', '0', '2/3'], [1, '2/3', '2/3', '0'], [1, '2/3', '2/3', '2/3'], [1, '4/3', '4/3', '2/3'], [1, '2', '2', '1']]);
  const tune = parse('(3C y2 D E F |');
  const spacer = tune.lines[0].staff[0].voices[0].find((element) => element.rest?.type === 'spacer');
  Object.assign(spacer, { endTriplet: true, startTriplet: 7, tripletMultiplier: 1 / 7 });
  assert.deepEqual(positions(buildScoreTiming(tune).voices[0]), positions(score.voices[0]));
});

test('enormous multi-rests fail before expansion in timing and native mapping', () => {
  const tune = parse('Z1000000000 | C4 |');
  for (const build of [buildScoreTiming, computeScoreMeasureMapping]) {
    assert.throws(() => build(tune), (error) => error.code === 'SCORE_TOO_COMPLEX');
  }
  assert.throws(() => timing('X1000000000 | C4 |'), (error) => error.code === 'SCORE_TOO_COMPLEX');
});

test('written measure and aggregate entry budgets bound ordinary and expanded inputs', () => {
  const note = { el_type: 'note', duration: 1 };
  const bar = { el_type: 'bar', type: 'bar_thin' };
  const tune = { lines: [{ staff: [{ voices: [Array.from({ length: 16_385 }, () => [note, bar]).flat()] }] }] };
  assert.throws(() => computeScoreMeasureMapping(tune), (error) => error.code === 'SCORE_TOO_COMPLEX');
  const entries = { lines: [{ staff: [{ voices: [Array(100_001).fill({ el_type: 'key' })] }] }] };
  assert.throws(() => buildScoreTiming(entries), (error) => error.code === 'SCORE_TOO_COMPLEX');
  const rests = { lines: [{ staff: [{ voices: Array.from({ length: 7 }, () => [
    { el_type: 'note', duration: 16_384, rest: { type: 'multimeasure', text: 16_384 } },
  ]) }] }] };
  assert.throws(() => buildScoreTiming(rests), (error) => error.code === 'SCORE_TOO_COMPLEX');
});

test('multi-rest counts must be positive safe integers', () => {
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const tune = { lines: [{ staff: [{ voices: [[
      { el_type: 'note', duration: 1, rest: { type: 'multimeasure', text: count } },
    ]] }] }] };
    assert.throws(() => buildScoreTiming(tune), /positive integer count/);
  }
});

test('explicit meter fractions remain usable when an adapter omits the type tag', () => {
  const tune = {
    getMeter: () => ({ value: [{ num: '3', den: '4' }] }),
    lines: [{ staff: [{ voices: [[
      { el_type: 'note', duration: 0.75 }, { el_type: 'bar' },
      { el_type: 'note', duration: 0.75 }, { el_type: 'bar' },
    ]] }] }],
  };
  assert.deepEqual(intervals(buildScoreTiming(tune)), [[1, '0', '3'], [2, '3', '3']]);
  assert.throws(() => buildScoreTiming({ ...tune,
    getMeter: () => ({ type: 'unknown', value: [{ num: '3', den: '4' }] }),
  }), (error) => error.code === 'UNSUPPORTED_METER');
});
