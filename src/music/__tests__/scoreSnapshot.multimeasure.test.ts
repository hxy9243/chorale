import { describe, expect, it } from 'vitest';
import { extractScore } from '../scoreSnapshot';
import { buildAbcPresentation } from '../abcPresentation';

describe('multimeasure rest synchronization', () => {
  const polyphonicMultimeasureAbc = `X:1
T:Multimeasure Synchronization
M:4/4
L:1/16
V:1
V:2
K:C
V:1
c16 | d16 | e16 | f16 | g16 |
V:2
Z4 | G16 |
`;

  it('allocates rest events across all measures spanned by a multimeasure rest', () => {
    const score = extractScore(polyphonicMultimeasureAbc);
    expect(score.measures).toHaveLength(5);
    expect(score.voices).toEqual(['1', '2']);

    for (let m = 1; m <= 4; m++) {
      const measure = score.measures[m - 1];
      expect(measure.measureNumber).toBe(m);
      expect(measure.voiceSources.map((v) => v.voiceId)).toEqual(['1', '2']);

      const v1Event = measure.events.find((e) => e.voiceId === '1');
      const v2Event = measure.events.find((e) => e.voiceId === '2');
      expect(v1Event?.type).toBe('note');
      expect(v2Event?.type).toBe('rest');
      expect(v2Event?.position.measure).toBe(m);
      expect(v2Event?.duration).toEqual({ numerator: 1, denominator: 1 });
    }

    const m5 = score.measures[4];
    expect(m5.measureNumber).toBe(5);
    const m5V1 = m5.events.find((e) => e.voiceId === '1');
    const m5V2 = m5.events.find((e) => e.voiceId === '2');
    expect(m5V1?.type).toBe('note');
    expect(m5V2?.type).toBe('note');
    expect(m5V2?.position.measure).toBe(5);
  });

  it('generates presentation cells for all measures in multimeasure spans', () => {
    const presentation = buildAbcPresentation(polyphonicMultimeasureAbc);
    expect(presentation.measureCount).toBe(5);
    expect(presentation.voices).toHaveLength(2);

    const v1 = presentation.voices.find((v) => v.id === '1')!;
    const v2 = presentation.voices.find((v) => v.id === '2')!;
    expect(v1.cells).toHaveLength(5);
    expect(v2.cells).toHaveLength(5);
    expect(v2.cells.map((c) => c.measureNumber)).toEqual([1, 2, 3, 4, 5]);

    // Multimeasure rest cells must not be individually cell-editable
    for (let i = 0; i < 4; i++) {
      expect(v2.cells[i].editable).toBe(false);
    }
    // Measure 5 note cell is editable
    expect(v2.cells[4].editable).toBe(true);
  });

  it('maintains voice alignment across interleaved multimeasure blocks (YuE2 style)', () => {
    const yueSnippet = `X:1
T:YuE2 Style Score
M:4/4
L:1/16
Q:1/4=85
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:D#m
% intro
V: Vocal
z8"Bmaj7"z8|"Bmaj7"z16|"C#"z16|"D#m7"z16|
V: Ins
z12z3a|a3c'3g6f2a2|g3c'3e8z2|e3f3c8Ac|
% verse
V: Vocal
"Bmaj7"a2dd3z4d2f2a2|"C#"g3c3z4c2d2e2|"D#m7"e2fe2c2cc2AA3GA-|"D#m7"A2z8d2f2g2|
V: Ins
Z4|
% chorus
V: Vocal
"Bmaj7"a3d3cd3d2f2a2|"C#"g3c3z4c2d2e2|"D#m7"e2fe2c2cc2AA3GA-|"D#m7"A2z8d2f2g2|
V: Ins
Z4|
`;

    const score = extractScore(yueSnippet);
    expect(score.measures).toHaveLength(12);
    expect(score.voices).toEqual(['Vocal', 'Ins']);

    for (let m = 1; m <= 12; m++) {
      const measure = score.measures[m - 1];
      expect(measure.measureNumber).toBe(m);
      expect(measure.voiceSources.some((v) => v.voiceId === 'Vocal')).toBe(true);
      expect(measure.voiceSources.some((v) => v.voiceId === 'Ins')).toBe(true);
    }

    const presentation = buildAbcPresentation(yueSnippet);
    expect(presentation.measureCount).toBe(12);
    const vocal = presentation.voices.find((v) => v.id === 'Vocal')!;
    const ins = presentation.voices.find((v) => v.id === 'Ins')!;
    expect(vocal.cells).toHaveLength(12);
    expect(ins.cells).toHaveLength(12);
  });
});
