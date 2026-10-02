import assert from 'node:assert/strict';
import test from 'node:test';
import { extractHarmonicSlices, extractScoreEvents } from '../server/music/score-semantics.mjs';
import { createVoiceResolver, prepareAbcWithMap } from '../shared/abc-source.mjs';
import { computeScoreMeasureMapping } from '../shared/score-timing.mjs';
import { sliceMeasureRange, deleteMeasures, replaceMeasures } from '../server/utils/measure-ops.mjs';
import abcjs from 'abcjs';
import { HARMONY_REGRESSION_FIXTURES } from './fixtures/harmony-regression.mjs';

const header = 'X:1\nM:4/4\nL:1/4\nK:C\n';
const literal = ({ position, durationQuarterLength, soundingPitches, literalBass }) => ({
  position, durationQuarterLength, soundingPitches, literalBass,
});
test('all harmonic literal fixtures run without Python and match their complete expected lists', async (t) => {
  for (const fixture of HARMONY_REGRESSION_FIXTURES) await t.test(fixture.id, () => {
    const result = extractHarmonicSlices(fixture.abcSource, fixture.range.startMeasure, fixture.range.endMeasure);
    assert.deepEqual(result.slices.map(literal), fixture.expectedSlices.map((s) => literal({ ...s, literalBass: s.literalBass ?? s.soundingPitches[0] })));
    assert.equal(result.measureCount, fixture.range.endMeasure - fixture.range.startMeasure + 1);
    if (Object.hasOwn(fixture, 'expectedPassageKey')) assert.equal(result.passageKey, fixture.expectedPassageKey);
    for (const slice of result.slices) {
      assert.ok(slice.sourceEventIds.length > 0);
      assert.ok(slice.position.measure >= fixture.range.startMeasure && slice.position.measure <= fixture.range.endMeasure);
    }
  });
});
test('partial-chord ties merge only the tied pitch and preserve both original source ranges', () => {
  const source = header + '[^F-Ac]4 | [FAc]4 |';
  const result = extractScoreEvents(source);
  const tied = result.events.find((e) => e.pitch === 'F#4');
  assert.deepEqual(tied.start, { num: 0, den: 1 });
  assert.deepEqual(tied.end, { num: 8, den: 1 });
  assert.equal(tied.sourceRanges.length, 2);
  assert.deepEqual(tied.sourceRanges.map((r) => source.slice(r.start, r.end).trim()), ['[^F-Ac]4', '[FAc]4']);
  assert.equal(result.events.filter((e) => e.pitch === 'A4').length, 2);
  assert.deepEqual(extractHarmonicSlices(source, 2, 2).slices[0].soundingPitches, ['F#4', 'A4', 'C5']);
});
test('naturals reset by octave and bar while tied pitch spelling survives a key change', () => {
  const source = header.replace('K:C', 'K:G') + '=F2 f2 | F4 |';
  assert.deepEqual(extractHarmonicSlices(source, 1, 2).slices.map((s) => s.soundingPitches), [['F4'], ['F#5'], ['F#4']]);
  const tied = header + '^F4- | [K:G] F4 |';
  assert.deepEqual(extractHarmonicSlices(tied, 2, 2).slices[0].soundingPitches, ['F#4']);
});
test('inline octave-clef changes affect only following sounding notes', () => {
  const source = header.replace('K:C', 'K:C clef=treble-8') + 'C4 | [K:clef=treble] C4 |';
  assert.deepEqual(extractHarmonicSlices(source, 1, 2).slices.map((s) => s.soundingPitches), [['C3'], ['C4']]);
});
test('source identity survives blank-line preparation and compacted later staves', () => {
  const source = header + 'V:S\nC4 |\n\nV:B\nE4 | F4 |';
  const result = extractScoreEvents(source);
  assert.equal(result.voices.length, 2);
  assert.deepEqual(result.events.map((e) => e.voiceId), ['S', 'B', 'B']);
  for (const event of result.events) for (const range of event.sourceRanges) assert.match(source.slice(range.start, range.end), /[CEF]4/);
  assert.deepEqual(extractHarmonicSlices(source, 2, 2).slices[0].soundingPitches, ['F4']);
});
test('comments and quoted directives never become musical context or hide later measures', () => {
  const source = header + 'C4 | % [K:G] is prose\n"[K:G]" F4 | F4 |';
  assert.deepEqual(extractHarmonicSlices(source, 1, 3).slices.map((s) => s.soundingPitches), [['C4'], ['F4'], ['F4']]);
  const excerpt = sliceMeasureRange(source, 1, 3).selectedAbc;
  assert.match(excerpt, /prose\n/);
  assert.deepEqual(extractHarmonicSlices(excerpt, 1, 3).slices.map((s) => s.soundingPitches), [['C4'], ['F4'], ['F4']]);
  const afterDelete = deleteMeasures(source, 3, 3);
  assert.deepEqual(extractHarmonicSlices(afterDelete, 1, 2).slices.map((s) => s.soundingPitches), [['C4'], ['F4']]);
  const afterReplace = replaceMeasures(source, 3, 3, 'G4 |');
  assert.deepEqual(extractHarmonicSlices(afterReplace, 1, 3).slices.map((s) => s.soundingPitches), [['C4'], ['F4'], ['G4']]);
});
test('a split repeat in one part does not shift unsplit simultaneous voices', () => {
  const source = header + 'V:S\nC4 | D2 :| E2 | F4 |\nV:B\nC,4 | G,4 | A,4 |';
  const slices = extractHarmonicSlices(source, 2, 3).slices;
  assert.deepEqual(slices.map((s) => [s.position.measure, s.position.offsetQuarterLength, s.soundingPitches]),
    [[2, '0', ['G3', 'D4']], [2, '2', ['G3', 'E4']], [3, '0', ['A3', 'F4']]]);
});
test('cross-source mapping adapters share exact written numbers', () => {
  for (const body of ['|: C4 | D4 :|', 'C |\nD4 |\nE4 |', 'Z4 | G4 |', 'C4 | D2 :|\nE2 | F4 |', 'C4 | D4']) {
    const source = header + body;
    const prepared = prepareAbcWithMap(source);
    const tune = abcjs.parseOnly(prepared.prepared)[0];
    const mapping = computeScoreMeasureMapping(tune, { voiceIdFor: createVoiceResolver(source, prepared.toOriginalOffset) });
    assert.deepEqual(extractScoreEvents(source).mapping.barToMeasure, mapping.barToMeasure);
  }
});
test('unsupported or malformed musical input fails explicitly, never as invented empty evidence', () => {
  for (const [source, code] of [
    [header + '^/F4 |', 'ANALYSIS_UNSUPPORTED_NOTATION'],
    [header + '{c}D4 |', 'ANALYSIS_UNSUPPORTED_NOTATION'],
    [header.replace('K:C', 'K:C clef=perc') + 'C4 |', 'ANALYSIS_UNSUPPORTED_NOTATION'],
    [header + 'C4- |', 'ANALYSIS_INVALID_TIE'],
  ]) assert.throws(() => extractHarmonicSlices(source, 1, 1), (e) => e.code === code);
  assert.throws(() => extractHarmonicSlices(header + 'C4 |', 0, 0), (e) => e.code === 'INVALID_RANGE');
  assert.throws(() => extractHarmonicSlices(header + 'C4 |', 1, 2), (e) => e.code === 'INVALID_RANGE');
  assert.throws(() => extractHarmonicSlices(header + 'C4 |', 1, 17), (e) => e.code === 'ANALYSIS_RANGE_TOO_LARGE');
});

test('shared-staff layout continuations retain independent voice key state', () => {
  const source = header + '%%score (S B)\nV:S\nc4 | [K:G] f4 |\nf4 |\nV:B\nC4 | F4 |\nF4 |';
  assert.deepEqual(extractHarmonicSlices(source, 2, 3).slices.map((s) => s.soundingPitches), [['F4', 'F#5'], ['F4', 'F#5']]);
  const switched = header + 'V:S\nC4 |\nV:S\n[K:G] F4 |';
  assert.deepEqual(extractHarmonicSlices(switched, 1, 2).slices.map((s) => s.soundingPitches), [['C4'], ['F#4']]);
});
test('overlays and unmodelled MIDI pitch directives fail closed without rejecting prose ampersands', () => {
  for (const body of ['V:S\nC2 D2 & E2 F2 |', '%%MIDI transpose -12\nC4 |', 'C2 [I:MIDI transpose -12] C2 |', '%%MIDI channel 10\nC4 |']) {
    assert.throws(() => extractHarmonicSlices(header + body, 1, 1), (e) => e.code === 'ANALYSIS_UNSUPPORTED_NOTATION');
  }
  const source = 'X:1\nT:Rock & Roll\nM:4/4\nL:1/4\nK:C\n"rock & roll" C4 | % & is prose';
  assert.deepEqual(extractHarmonicSlices(source, 1, 1).slices[0].soundingPitches, ['C4']);
});

test('voice options honor quoted values and ignore option-like display names', () => {
  for (const declaration of ['V:S clef="treble-8"', 'V:S clef =treble-8']) {
    assert.deepEqual(extractHarmonicSlices(header + declaration + '\nC4|', 1, 1).slices[0].soundingPitches, ['C3']);
  }
  for (const declaration of ['V:S name="Singer clef=treble-8 notes"']) {
    assert.deepEqual(extractHarmonicSlices(header + declaration + '\nC4|', 1, 1).slices[0].soundingPitches, ['C4']);
  }
});
test('rootless explicit key alterations remain pitch facts with uncertain functional key', () => {
  for (const field of ['^F', 'exp ^F']) {
    const slice = extractHarmonicSlices(header + `C4 | [K:${field}] F4 |`, 2, 2).slices[0];
    assert.deepEqual(slice.soundingPitches, ['F#4']);
    assert.equal(slice.localKey, null);
  }
});
test('the event budget includes individual chord pitches, before normalized event allocation', () => {
  assert.throws(() => extractScoreEvents(header + `[${'C'.repeat(50_001)}]4 |`), (e) => e.code === 'ANALYSIS_TOO_COMPLEX');
});

test('metadata and lyric text containing inline-field syntax cannot alter music', () => {
  const title = 'X:1\nT:Example [K:G] [V:B]\nM:4/4\nL:1/4\nK:C\nF4|';
  assert.deepEqual(extractHarmonicSlices(title, 1, 1).slices[0].soundingPitches, ['F4']);
  const lyrics = header + 'F4|\nw:sing [K:G] [V:B]\nF4|';
  assert.deepEqual(extractHarmonicSlices(lyrics, 1, 2).slices.map((s) => s.soundingPitches), [['F4'], ['F4']]);
});

test('aggregate slice evidence is bounded as well as input notes and slice count', () => {
  const source = header.replace('L:1/4', 'L:1/16') + `V:S\n[${'C'.repeat(20_000)}]16 |\nV:B\n${'D '.repeat(16)}|`;
  assert.throws(() => extractHarmonicSlices(source, 1, 1), (e) => e.code === 'ANALYSIS_TOO_COMPLEX');
});

test('the evidence budget includes expanded provenance for long merged ties', () => {
  const source = header.replace('L:1/4', 'L:1/64') + `V:S\n${'C16- C16- C16- C16- |\n'.repeat(749)}C16- C16- C16- C16 |\nV:B\n${('D '.repeat(64) + '|\n').repeat(2)}`;
  assert.throws(() => extractHarmonicSlices(source, 1, 2), (e) => e.code === 'ANALYSIS_TOO_COMPLEX');
});
