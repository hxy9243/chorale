import abcjs from 'abcjs';
import { describe, expect, it } from 'vitest';
import { buildScoreTiming, rationalToText } from '../../../shared/score-timing.mjs';
import { createVoiceResolver } from '../../../shared/abc-source.mjs';
import { prepareAbcWithMap } from '../../utils/abcAudio';
import { extractScore, getScoreMeasureMappingAbc } from '../scoreSnapshot';
import { buildAbcPresentation } from '../abcPresentation';

const abc = (body: string, length = '1/4') => `X:1\nM:4/4\nL:${length}\nK:C\n${body}`;

function expectCanonicalParity(source: string) {
  const { prepared, toOriginalOffset } = prepareAbcWithMap(source);
  const tune = abcjs.parseOnly(prepared)[0];
  const timing = buildScoreTiming<abcjs.VoiceItem>(tune, { voiceIdFor: createVoiceResolver(source, toOriginalOffset) });
  const snapshot = extractScore(source);
  const presentation = buildAbcPresentation(source);
  for (const voice of timing.voices) {
    const expected = voice.entries.filter(({ element }) => element.el_type === 'note' && element.rest?.type !== 'spacer');
    const extracted = snapshot.measures.flatMap(({ events }) => events).filter(({ voiceId }) => voiceId === voice.voiceId);
    const cells = presentation.voices.find(({ id }) => id === voice.voiceId)!.cells;
    const presented = cells.flatMap((cell) => cell.events.map((event) => ({ ...event, measure: cell.measureNumber })));
    expect(extracted).toHaveLength(expected.length);
    expect(presented).toHaveLength(expected.length);
    expected.forEach((entry, index) => {
      const actual = extracted[index];
      const shown = presented[index];
      expect(actual.position.measure).toBe(entry.measure);
      expect(actual.position.offset.numerator * entry.offset.den * 4)
        .toBe(entry.offset.num * actual.position.offset.denominator);
      expect(actual.duration.numerator * entry.duration.den * 4)
        .toBe(entry.duration.num * actual.duration.denominator);
      expect(shown.measure).toBe(entry.measure);
      expect(shown.start).toBeCloseTo(entry.offset.num / entry.offset.den / 4, 14);
      expect(shown.duration).toBeCloseTo(entry.duration.num / entry.duration.den / 4, 14);
      expect(actual.abcRange).toEqual(shown.range);
    });
  }
  expect(getScoreMeasureMappingAbc(source).totalMeasures).toBe(timing.mapping.totalMeasures);
  return { timing, snapshot, presentation };
}

describe('canonical timing parity across score adapters', () => {
  it('aligns an unsplit bass when only soprano has a split repeat', () => {
    const { snapshot, presentation } = expectCanonicalParity(abc('V:S\nC4|D2:|D2|E4|\nV:B\nC4|D4|E4|'));
    expect(snapshot.measures.map((measure) => measure.measureNumber)).toEqual([1, 2, 3]);
    expect(snapshot.measures[1].events.filter((event) => event.voiceId === 'B')).toHaveLength(1);
    expect(snapshot.measures[2].events.find((event) => event.voiceId === 'B')?.pitches?.[0].step).toBe('E');
    const bass = presentation.voices.find(({ id }) => id === 'B')!;
    expect(bass.cells.map(({ measureNumber }) => measureNumber)).toEqual([1, 2, 3]);
    expect(bass.cells[1].text).toBe('D4|');
    expect(bass.cells[2].text).toBe('E4|');
  });

  it('expands multi-rests once and keeps subsequent notes in measure five', () => {
    const { snapshot, presentation } = expectCanonicalParity(abc('V:S\nZ4 | c4 |\nV:B\nC4 | D4 | E4 | F4 | G4 |'));
    expect(snapshot.measures.map(({ measureNumber }) => measureNumber)).toEqual([1, 2, 3, 4, 5]);
    const soprano = presentation.voices.find(({ id }) => id === 'S')!;
    expect(soprano.cells.slice(0, 4).map(({ editable }) => editable)).toEqual([false, false, false, false]);
    expect(soprano.cells[4]).toMatchObject({ measureNumber: 5, editable: true, duration: 1 });
  });

  it('uses source identity when abcjs compacts missing staves on later systems', () => {
    const { snapshot, presentation } = expectCanonicalParity(abc('V:S\nc4 |\nd4 |\n\nV:B\nC4 |\nD4 |\nE4 |'));
    expect(snapshot.voices).toEqual(['S', 'B']);
    expect(snapshot.measures[2].events.map(({ voiceId }) => voiceId)).toEqual(['B']);
    expect(presentation.voices.map(({ id, cells }) => [id, cells.length])).toEqual([['S', 2], ['B', 3]]);
  });

  it('preserves exact tuplet durations and ignores layout spacers in event timing', () => {
    const { timing, snapshot, presentation } = expectCanonicalParity(abc('(3C y2 D E F2 G2 A2 |', '1/8'));
    expect(timing.voices[0].entries.filter(({ element }) => element.el_type === 'note')
      .map(({ duration }) => rationalToText(duration))).toEqual(['1/3', '0', '1/3', '1/3', '1', '1', '1']);
    expect(snapshot.measures[0].events.slice(0, 3).map(({ duration }) => duration))
      .toEqual(Array(3).fill({ numerator: 1, denominator: 12 }));
    expect(presentation.voices[0].cells[0].events).toHaveLength(6);
    expect(presentation.voices[0].cells[0].duration).toBe(1);
    expect(presentation.voices[0].cells[0].text).toContain('y2');
  });

  it('preserves pickup zero across lines and keeps a final unterminated bar', () => {
    const { snapshot, presentation } = expectCanonicalParity(abc('|: C |\nD4 | E4'));
    expect(snapshot.measures.map(({ measureNumber }) => measureNumber)).toEqual([0, 1, 2]);
    expect(presentation.voices[0].cells.map(({ measureNumber }) => measureNumber)).toEqual([0, 1, 2]);
  });

  it('enforces expansion limits before frontend event or cell allocation', () => {
    const source = abc('Z1000000000 | C4 |');
    for (const build of [extractScore, buildAbcPresentation]) {
      expect(() => build(source)).toThrow(expect.objectContaining({ code: 'SCORE_TOO_COMPLEX' }));
    }
  });
});
