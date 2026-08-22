import { describe, expect, it } from 'vitest';
import {
  fitScoreSceneTracks,
  MIN_SCORE_ANNOTATION_WIDTH_REM,
  PREFERRED_SCORE_ANNOTATION_WIDTH_REM,
  PREFERRED_SCORE_NOTATION_WIDTH_REM,
  SCORE_SCENE_GAP_REM,
} from '../scoreSceneSizing';

const rem = (value: number) => value * 16;
const fit = (availableWidth: number) => fitScoreSceneTracks({
  availableWidth,
  notationWidth: rem(PREFERRED_SCORE_NOTATION_WIDTH_REM),
  annotationWidth: rem(PREFERRED_SCORE_ANNOTATION_WIDTH_REM),
  minAnnotationWidth: rem(MIN_SCORE_ANNOTATION_WIDTH_REM),
  gap: rem(SCORE_SCENE_GAP_REM),
});

describe('fitScoreSceneTracks', () => {
  it('keeps the symmetric scene when it fully fits', () => {
    const available = rem(48 + 2 * 24 + 2 * 0.5);
    expect(fit(available)).toEqual({
      balanceWidth: rem(24),
      annotationWidth: rem(24),
    });
  });

  it('caps the balance spacer at its preferred width when extra room exists', () => {
    const available = rem(48 + 2 * 24 + 40);
    expect(fit(available)).toEqual({
      balanceWidth: rem(24),
      annotationWidth: rem(24),
    });
  });

  it('collapses the balance spacer first while the rail stays preferred', () => {
    const available = rem(48 + 24 + 12);
    expect(fit(available)).toEqual({
      balanceWidth: rem(11),
      annotationWidth: rem(24),
    });
    expect(fit(rem(48 + 24))).toEqual({
      balanceWidth: 0,
      annotationWidth: rem(23),
    });
  });

  it('narrows only the rail after the spacer reaches zero', () => {
    const available = rem(48 + 19);
    expect(fit(available)).toEqual({
      balanceWidth: 0,
      annotationWidth: rem(18),
    });
  });

  it('holds the rail at its floor and overflows below that', () => {
    expect(fit(rem(48 + 16))).toEqual({
      balanceWidth: 0,
      annotationWidth: rem(16),
    });
    expect(fit(rem(30))).toEqual({
      balanceWidth: 0,
      annotationWidth: rem(16),
    });
  });

  it('tolerates degenerate zero inputs', () => {
    expect(fitScoreSceneTracks({
      availableWidth: -10,
      notationWidth: 0,
      annotationWidth: 0,
      minAnnotationWidth: 0,
      gap: 0,
    })).toEqual({ balanceWidth: 0, annotationWidth: 0 });
  });
});
