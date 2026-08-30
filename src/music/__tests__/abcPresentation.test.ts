import { describe, expect, it } from 'vitest';

import {
  buildAbcPresentation,
  resolvePlaybackMeasure,
  validateAbcMeasureEdit,
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
    expect(elapsed).toBeLessThan(250);
  });
});
