import { describe, expect, it } from 'vitest';
import {
  addRationalDurations,
  compareRationalDurations,
  createRationalDuration,
  isRationalDuration,
} from '../rational';

describe('rational durations', () => {
  it('constructs reduced, immutable durations', () => {
    const duration = createRationalDuration(6, 8);

    expect(duration).toEqual({ numerator: 3, denominator: 4 });
    expect(Object.isFrozen(duration)).toBe(true);
    expect(createRationalDuration(0, 16)).toEqual({ numerator: 0, denominator: 1 });
  });

  it('rejects values that cannot represent musical duration exactly', () => {
    expect(() => createRationalDuration(-1, 4)).toThrow(/non-negative/);
    expect(() => createRationalDuration(1, 0)).toThrow(/positive/);
    expect(() => createRationalDuration(0.5, 4)).toThrow(/safe integer/);
    expect(() => createRationalDuration(Number.MAX_SAFE_INTEGER + 1, 4)).toThrow(/safe integer/);
  });

  it('validates normalized rational values', () => {
    expect(isRationalDuration({ numerator: 3, denominator: 8 })).toBe(true);
    expect(isRationalDuration({ numerator: 2, denominator: 4 })).toBe(false);
    expect(isRationalDuration({ numerator: -1, denominator: 4 })).toBe(false);
    expect(isRationalDuration({ numerator: 1, denominator: -4 })).toBe(false);
    expect(isRationalDuration({ numerator: 1, denominator: 4, unit: 'beat' })).toBe(true);
    expect(isRationalDuration(null)).toBe(false);
  });

  it('adds and reduces durations exactly', () => {
    expect(addRationalDurations(
      createRationalDuration(1, 6),
      createRationalDuration(1, 3),
    )).toEqual({ numerator: 1, denominator: 2 });
  });

  it('compares durations without floating-point rounding', () => {
    const oneThird = createRationalDuration(1, 3);

    expect(compareRationalDurations(oneThird, createRationalDuration(2, 6))).toBe(0);
    expect(compareRationalDurations(oneThird, createRationalDuration(3, 8))).toBe(-1);
    expect(compareRationalDurations(createRationalDuration(3, 8), oneThird)).toBe(1);
  });

  it('rejects arithmetic over unnormalized values and unsafe results', () => {
    expect(() => addRationalDurations(
      { numerator: 2, denominator: 4 },
      createRationalDuration(1, 4),
    )).toThrow(/normalized/);
    expect(() => addRationalDurations(
      createRationalDuration(Number.MAX_SAFE_INTEGER, 1),
      createRationalDuration(1, 1),
    )).toThrow(/safe integer range/);
  });
});
