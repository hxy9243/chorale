import { describe, expect, it } from 'vitest';
import {
  friendlyBeatFromRational,
  parseMeterBeatGrid,
  rationalPositionFromBeat,
} from '../meterPosition';

describe('meter-aware annotation positions', () => {
  it('maps simple-meter beats and subdivisions to exact whole-note offsets', () => {
    const grid = parseMeterBeatGrid('4/4');
    expect(grid).toEqual({ beats: 4, beatDuration: { numerator: 1, denominator: 4 } });
    expect(rationalPositionFromBeat(grid, { beat: 2, subdivision: 1, step: 0 }))
      .toEqual({ numerator: 1, denominator: 4 });
    expect(rationalPositionFromBeat(grid, { beat: 3, subdivision: 2, step: 1 }))
      .toEqual({ numerator: 5, denominator: 8 });
  });

  it('treats 6/8 as two compound beats so beat 2 starts at 3/8', () => {
    const grid = parseMeterBeatGrid('6/8');
    expect(grid).toEqual({ beats: 2, beatDuration: { numerator: 3, denominator: 8 } });
    expect(rationalPositionFromBeat(grid, { beat: 2, subdivision: 1, step: 0 }))
      .toEqual({ numerator: 3, denominator: 8 });
    expect(rationalPositionFromBeat(grid, { beat: 1, subdivision: 3, step: 2 }))
      .toEqual({ numerator: 1, denominator: 4 });
  });

  it('round-trips friendly representable positions and falls back safely', () => {
    const grid = parseMeterBeatGrid('4/4');
    expect(friendlyBeatFromRational(grid, { numerator: 5, denominator: 8 }))
      .toEqual({ beat: 3, subdivision: 2, step: 1 });
    expect(friendlyBeatFromRational(grid, { numerator: 1, denominator: 7 }))
      .toEqual({ beat: 1, subdivision: 4, step: 0 });
    expect(parseMeterBeatGrid('free')).toEqual({
      beats: 4,
      beatDuration: { numerator: 1, denominator: 4 },
    });
  });

  it('rejects beat and subdivision values outside the meter grid', () => {
    const grid = parseMeterBeatGrid('3/4');
    expect(() => rationalPositionFromBeat(grid, { beat: 4, subdivision: 1, step: 0 }))
      .toThrow('Beat must be between 1 and 3');
    expect(() => rationalPositionFromBeat(grid, { beat: 2, subdivision: 2, step: 2 }))
      .toThrow('Subdivision step is outside the beat');
  });
});
