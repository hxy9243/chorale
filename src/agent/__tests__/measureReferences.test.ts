import { describe, expect, it } from 'vitest';
import { parseMeasureReference } from '../measureReferences';

describe('measure reference parser', () => {
  it('parses single measures and inclusive ranges', () => {
    expect(parseMeasureReference('#measure-3', 8)).toEqual({
      startMeasure: 3,
      endMeasure: 3,
    });
    expect(parseMeasureReference('#measure-3-7', 8)).toEqual({
      startMeasure: 3,
      endMeasure: 7,
    });
  });

  it('normalizes reverse ranges', () => {
    expect(parseMeasureReference('#measure-7-3', 8)).toEqual({
      startMeasure: 3,
      endMeasure: 7,
    });
  });

  it('rejects malformed, non-canonical, unsafe, and out-of-score targets', () => {
    for (const href of [
      '#measure-0',
      '#measure-01',
      '#measure-2-',
      '#measure-2-3-extra',
      '#measure-999999999999999999999',
      'https://example.com/#measure-2',
      '#Measure-2',
    ]) {
      expect(parseMeasureReference(href, 8), href).toBeNull();
    }
    expect(parseMeasureReference('#measure-9', 8)).toBeNull();
    expect(parseMeasureReference('#measure-1', 0)).toBeNull();
    expect(parseMeasureReference(undefined, 8)).toBeNull();
  });
});
