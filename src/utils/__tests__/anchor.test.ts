import { describe, it, expect } from 'vitest';
import { formatAnchorLabel, isSameAnchor } from '../anchor';
import type { ScoreAnchor } from '../../types/document';

describe('Anchor Utilities', () => {
  it('formatAnchorLabel formats single measure and measure ranges', () => {
    const single: ScoreAnchor = { measure: 4 };
    expect(formatAnchorLabel(single)).toBe('m. 4');

    const range: ScoreAnchor = { measure: 5, endMeasure: 8 };
    expect(formatAnchorLabel(range)).toBe('m. 5–8');

    const withBeat: ScoreAnchor = { measure: 12, beat: 2 };
    expect(formatAnchorLabel(withBeat)).toBe('m. 12, beat 2');

    const customLabel: ScoreAnchor = { measure: 1, label: 'Intro measure' };
    expect(formatAnchorLabel(customLabel)).toBe('Intro measure');
  });

  it('formatAnchorLabel returns empty string for null or undefined', () => {
    expect(formatAnchorLabel(null)).toBe('');
    expect(formatAnchorLabel(undefined)).toBe('');
  });

  it('isSameAnchor checks equality between anchor objects', () => {
    const a: ScoreAnchor = { measure: 3, beat: 1 };
    const b: ScoreAnchor = { measure: 3, beat: 1 };
    const c: ScoreAnchor = { measure: 4, beat: 1 };

    expect(isSameAnchor(a, b)).toBe(true);
    expect(isSameAnchor(a, c)).toBe(false);
    expect(isSameAnchor(null, null)).toBe(true);
    expect(isSameAnchor(a, null)).toBe(false);
  });
});
