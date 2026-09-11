import { describe, expect, it } from 'vitest';

import {
  analyzeRawAbcLines,
  buildAbcPresentation,
  resolvePlaybackMeasure,
  validateAbcHeaderEdit,
  validateAbcMeasureEdit,
  transposeAbcMeasureText,
} from '../abcPresentation';

const multiVoiceAbc = `X:1
T:Two voices
T:Study
C:Bach
M:4/4
L:1/4
Q:1/4=96
V:upper clef=treble
V:lower clef=bass
K:C
[V:upper] C D E F | G A B c |: c B A G :|
[V:lower] C,4 | G,4 |: C,4 :|
`;

describe('ABC presentation feasibility contract', () => {
  it('projects literal headers and aligned written measures for every voice', () => {
    const presentation = buildAbcPresentation(multiVoiceAbc);

    expect(presentation.headers.map(({ text }) => text)).toContain('C:Bach');
    expect(presentation.headers.find(({ text }) => text === 'C:Bach')?.label).toBe('Composer');
    expect(presentation.headers.filter(({ tag }) => tag === 'T').map(({ label }) => label))
      .toEqual(['Title', 'Subtitle']);
    expect(presentation.voices.map(({ id }) => id)).toEqual(['upper', 'lower']);
    expect(presentation.voices.map(({ cells }) => cells.map(({ measureNumber }) => measureNumber)))
      .toEqual([[1, 2, 3], [1, 2, 3]]);
    expect(presentation.voices[0].cells[0].text).toContain('C D E F');
    expect(presentation.voices[0].cells[0].text).toContain('|');
    expect(presentation.boundaryRanges.map((range) => presentation.abc.slice(range.start, range.end)).join(''))
      .toContain(':|');
  });

  it('patches one safe measure without changing headers, voices, or boundaries', () => {
    const presentation = buildAbcPresentation(multiVoiceAbc);
    const result = validateAbcMeasureEdit(presentation, 'upper:1', 'E F G A |');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.abc).toContain('[V:upper] E F G A | G A B c');
    expect(result.presentation.measureCount).toBe(3);
    expect(result.presentation.voices.map(({ id }) => id)).toEqual(['upper', 'lower']);
  });

  it('rejects structural and invalid local edits without changing canonical source', () => {
    const presentation = buildAbcPresentation(multiVoiceAbc);

    expect(validateAbcMeasureEdit(presentation, 'upper:1', 'C D | E F')).toEqual({
      ok: false,
      error: 'Measure structure changed. Use Raw Source.',
    });
    expect(validateAbcMeasureEdit(presentation, 'upper:1', 'C D\nE F')).toEqual({
      ok: false,
      error: 'Formatted measure edits must stay on one line and cannot add comments.',
    });
  });

  it('completes underfilled measures with an exact trailing rest and rejects overfill', () => {
    const fourFour = buildAbcPresentation(`X:1\nM:4/4\nL:1/4\nK:C\nC D |\n`);
    const completed = validateAbcMeasureEdit(fourFour, 'voice-1:1', 'C D |');
    expect(completed.ok).toBe(true);
    if (completed.ok) expect(completed.abc).toContain('C D z2|');

    const sixEight = buildAbcPresentation(`X:1\nM:6/8\nL:1/8\nK:C\nC D E F |\n`);
    const paddedCompound = validateAbcMeasureEdit(sixEight, 'voice-1:1', 'C D E F |');
    expect(paddedCompound.ok).toBe(true);
    if (paddedCompound.ok) expect(paddedCompound.abc).toContain('C D E F z2|');

    const overfilled = validateAbcMeasureEdit(fourFour, 'voice-1:1', 'C D E F G |');
    expect(overfilled.ok).toBe(false);
  });

  it('maps simultaneous playback ranges only when they agree on one written measure', () => {
    const presentation = buildAbcPresentation(multiVoiceAbc);
    const upper = presentation.voices[0].cells[1].range;
    const lower = presentation.voices[1].cells[1].range;
    const later = presentation.voices[0].cells[2].range;

    expect(resolvePlaybackMeasure(presentation, [upper.start, lower.start], [upper.end, lower.end])).toBe(2);
    expect(resolvePlaybackMeasure(presentation, [upper.start, later.start], [upper.end, later.end])).toBeNull();
    expect(resolvePlaybackMeasure(presentation, undefined, undefined)).toBeNull();
  });

  it('keeps comments and unsupported source visible through a raw-only warning', () => {
    const presentation = buildAbcPresentation(`${multiVoiceAbc}% editorial note\n`);
    expect(presentation.rawOnlyRanges.length).toBeGreaterThan(0);
    expect(presentation.warnings).toEqual(['Additional source is available in Raw Source.']);
  });

  it('builds a representative 128-measure, eight-voice presentation within budget', () => {
    const voices = Array.from({ length: 8 }, (_, index) => `voice${index + 1}`);
    const abc = [
      'X:1', 'T:Large score', 'M:4/4', 'L:1/4',
      ...voices.map((voice) => `V:${voice}`),
      'K:C',
      ...voices.map((voice) => `[V:${voice}] ${Array.from({ length: 128 }, () => 'C D E F |').join(' ')}`),
    ].join('\n');
    const start = performance.now();
    const presentation = buildAbcPresentation(abc);
    const elapsed = performance.now() - start;

    expect(presentation.measureCount).toBe(128);
    expect(presentation.voices).toHaveLength(8);
    expect(elapsed).toBeLessThan(500);
  });

  it('analyzes raw lines with header explanations, voice backgrounds, and selection/playback highlights', () => {
    const rawAbc = `X:1
T:rainy day
M:3/4
K:C
[V:upper] C D E | F G A |
[V:lower] C,3 | F,3 |
`;
    const presentation = buildAbcPresentation(rawAbc);
    const activeAnchor = { startMeasure: 1, endMeasure: 1 };
    const playingMeasure = 2;

    const analysis = analyzeRawAbcLines(rawAbc, presentation, activeAnchor, playingMeasure);

    expect(analysis[0].text).toBe('X:1');
    expect(analysis[0].explanation).toBe('Reference: 1');

    expect(analysis[1].text).toBe('T:rainy day');
    expect(analysis[1].explanation).toBe('Title: rainy day');

    expect(analysis[2].text).toBe('M:3/4');
    expect(analysis[2].explanation).toBe('Meter: 3/4');

    expect(analysis[3].text).toBe('K:C');
    expect(analysis[3].explanation).toBe('Key: C');

    // Voice 1: upper (colorIndex 0)
    const upperLine = analysis[4];
    expect(upperLine.text).toBe('[V:upper] C D E | F G A |');
    expect(upperLine.voice).toEqual({ id: 'upper', colorIndex: 0 });
    expect(upperLine.isSelected).toBe(true); // Measure 1 is selected
    expect(upperLine.isPlaying).toBe(true); // Measure 2 is playing
    expect(upperLine.segments.find((s) => s.measureNumber === 1)?.isSelected).toBe(true);
    expect(upperLine.segments.find((s) => s.measureNumber === 2)?.isPlaying).toBe(true);
    expect(upperLine.segments.map((s) => s.text).join('')).toBe(upperLine.text);
    expect(upperLine.segments[0].text).toBe('[V:upper]');
    expect(upperLine.segments[1].text).toBe(' C D E |');
    expect(upperLine.segments[2].text).toBe(' F G A |');

    // Voice 2: lower (colorIndex 1)
    const lowerLine = analysis[5];
    expect(lowerLine.text).toBe('[V:lower] C,3 | F,3 |');
    expect(lowerLine.voice).toEqual({ id: 'lower', colorIndex: 1 });
    expect(lowerLine.isSelected).toBe(true); // Measure 1 is selected
    expect(lowerLine.isPlaying).toBe(true); // Measure 2 is playing
    expect(lowerLine.segments.find((s) => s.measureNumber === 1)?.isSelected).toBe(true);
    expect(lowerLine.segments.find((s) => s.measureNumber === 2)?.isPlaying).toBe(true);
    expect(lowerLine.segments.map((s) => s.text).join('')).toBe(lowerLine.text);
    expect(lowerLine.segments[0].text).toBe('[V:lower]');
    expect(lowerLine.segments[1].text).toBe(' C,3 |');
    expect(lowerLine.segments[2].text).toBe(' F,3 |');
  });

  it('validates and applies safe header edits', () => {
    const presentation = buildAbcPresentation(multiVoiceAbc);
    const titleHeader = presentation.headers.find((h) => h.tag === 'T');
    expect(titleHeader).toBeDefined();

    // Valid edit with tag
    const result1 = validateAbcHeaderEdit(presentation, titleHeader!.range, 'T:Three voices', 'T');
    expect(result1.ok).toBe(true);
    if (result1.ok) {
      expect(result1.abc).toContain('T:Three voices');
      expect(result1.presentation.headers[1].value).toBe('Three voices');
    }

    // Valid edit without tag (auto-prepends tag)
    const result2 = validateAbcHeaderEdit(presentation, titleHeader!.range, 'Four voices', 'T');
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.abc).toContain('T:Four voices');
    }

    // Invalid edit with newlines
    const invalidResult = validateAbcHeaderEdit(presentation, titleHeader!.range, 'T:Title\nK:G', 'T');
    expect(invalidResult.ok).toBe(false);
  });

  describe('transposeAbcMeasureText', () => {
    it('raises a semitone considering the active key (c->c# in K:C, c->d in K:C#)', () => {
      const presentationC = buildAbcPresentation(multiVoiceAbc);
      const cellC = presentationC.voices[0].cells[0];

      // In key C: c + 1 semitone -> ^c (c->c#, raising half a tone)
      const resC1 = transposeAbcMeasureText(presentationC, cellC.id, 'c', 1);
      expect(resC1).toBe('^c');

      // In key C: C D E F | + 1 semitone -> ^C ^D F ^F |
      const resCScale = transposeAbcMeasureText(presentationC, cellC.id, 'C D E F |', 1);
      expect(resCScale).toBe('^C ^D F ^F |');

      // In key C: c - 1 semitone -> B
      const resCMinus = transposeAbcMeasureText(presentationC, cellC.id, 'c', -1);
      expect(resCMinus).toBe('B');

      // In key C#: c (sounding C#) + 1 semitone -> =d (c->d)
      const abcCSharp = multiVoiceAbc.replace('K:C', 'K:C#');
      const presentationCSharp = buildAbcPresentation(abcCSharp);
      const cellCSharp = presentationCSharp.voices[0].cells[0];

      const resCSharp1 = transposeAbcMeasureText(presentationCSharp, cellCSharp.id, 'c', 1);
      expect(resCSharp1).toBe('=d');

      // In key C#: c - 1 semitone -> =c
      const resCSharpMinus = transposeAbcMeasureText(presentationCSharp, cellCSharp.id, 'c', -1);
      expect(resCSharpMinus).toBe('=c');
    });

    it('transposes octaves by ±12 semitones', () => {
      const presentation = buildAbcPresentation(multiVoiceAbc);
      const cellUpper = presentation.voices[0].cells[0];
      const cellLower = presentation.voices[1].cells[0];

      expect(transposeAbcMeasureText(presentation, cellUpper.id, 'C D E F |', 12)).toBe('c d e f |');
      expect(transposeAbcMeasureText(presentation, cellLower.id, 'C,4 |', 12)).toBe('C4 |');
      expect(transposeAbcMeasureText(presentation, cellUpper.id, 'c d e f |', -12)).toBe('C D E F |');
    });

    it('transposes notes inside chords while preserving chord delimiters, durations, and ties', () => {
      const presentation = buildAbcPresentation(multiVoiceAbc);
      const cell = presentation.voices[0].cells[0];

      expect(transposeAbcMeasureText(presentation, cell.id, '[CEG]2 |', 1)).toBe('[^CF^G]2 |');
      expect(transposeAbcMeasureText(presentation, cell.id, '!p! c2- c2 |', 1)).toBe('!p! ^c2- ^c2 |');
      expect(transposeAbcMeasureText(presentation, cell.id, '(3cde |', 1)).toBe('(3^c^df |');
      expect(transposeAbcMeasureText(presentation, cell.id, 'z4 |', 1)).toBe('z4 |');
    });
  });
});

