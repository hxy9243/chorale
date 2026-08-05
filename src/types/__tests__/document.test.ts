import { describe, expectTypeOf, it } from 'vitest';
import type {
  MeasureSpan,
  MusicalPosition,
  RationalDuration,
  ScoreAnchor,
} from '../document';

describe('shared musical document contracts', () => {
  it('uses exact rational offsets for musical positions', () => {
    expectTypeOf<MusicalPosition>().toEqualTypeOf<{
      measure: number;
      offset: RationalDuration;
    }>();
  });

  it('shares inclusive measure bounds with score anchors', () => {
    expectTypeOf<ScoreAnchor>().toMatchTypeOf<MeasureSpan>();
    expectTypeOf<MeasureSpan>().toEqualTypeOf<{
      startMeasure: number;
      endMeasure: number;
    }>();
  });
});
