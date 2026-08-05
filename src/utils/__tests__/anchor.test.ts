import { describe, it, expect } from 'vitest';
import { formatAnchorLabel, isSameAnchor } from '../anchor';
import type { ScoreAnchor } from '../../types/document';

describe('Anchor Utilities', () => {
  it('formatAnchorLabel formats single measure and measure ranges', () => {
    const single: ScoreAnchor = { startMeasure: 4, endMeasure: 4 };
    expect(formatAnchorLabel(single)).toBe('m. 4');

    const range: ScoreAnchor = { startMeasure: 5, endMeasure: 8 };
    expect(formatAnchorLabel(range)).toBe('mm. 5–8');

    const withBeat: ScoreAnchor = { startMeasure: 12, endMeasure: 12, beat: 2 };
    expect(formatAnchorLabel(withBeat)).toBe('m. 12, beat 2');

    const customLabel: ScoreAnchor = { startMeasure: 1, endMeasure: 1, label: 'Intro measure' };
    expect(formatAnchorLabel(customLabel)).toBe('Intro measure');
  });

  it('formatAnchorLabel returns empty string for null or undefined', () => {
    expect(formatAnchorLabel(null)).toBe('');
    expect(formatAnchorLabel(undefined)).toBe('');
  });

  it('isSameAnchor checks equality between anchor objects', () => {
    const a: ScoreAnchor = { startMeasure: 3, endMeasure: 3, beat: 1 };
    const b: ScoreAnchor = { startMeasure: 3, endMeasure: 3, beat: 1 };
    const c: ScoreAnchor = { startMeasure: 4, endMeasure: 4, beat: 1 };

    expect(isSameAnchor(a, b)).toBe(true);
    expect(isSameAnchor(a, c)).toBe(false);
    expect(isSameAnchor(null, null)).toBe(true);
    expect(isSameAnchor(a, null)).toBe(false);
  });
});
