import type { RationalDuration } from './rational';
import { createRationalDuration } from './rational';

export type MeterBeatGrid = Readonly<{
  beats: number;
  beatDuration: RationalDuration;
}>;

export type FriendlyBeatPosition = Readonly<{
  beat: number;
  subdivision: 1 | 2 | 3 | 4;
  step: number;
}>;

const DEFAULT_GRID: MeterBeatGrid = {
  beats: 4,
  beatDuration: createRationalDuration(1, 4),
};

export const parseMeterBeatGrid = (meter?: string): MeterBeatGrid => {
  const match = meter?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return DEFAULT_GRID;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (
    !Number.isSafeInteger(numerator)
    || !Number.isSafeInteger(denominator)
    || numerator <= 0
    || denominator <= 0
  ) {
    return DEFAULT_GRID;
  }
  const compound = numerator > 3 && numerator % 3 === 0;
  return compound
    ? {
        beats: numerator / 3,
        beatDuration: createRationalDuration(3, denominator),
      }
    : {
        beats: numerator,
        beatDuration: createRationalDuration(1, denominator),
      };
};

export const rationalPositionFromBeat = (
  grid: MeterBeatGrid,
  input: FriendlyBeatPosition,
): RationalDuration => {
  if (!Number.isSafeInteger(input.beat) || input.beat < 1 || input.beat > grid.beats) {
    throw new RangeError(`Beat must be between 1 and ${grid.beats}.`);
  }
  if (![1, 2, 3, 4].includes(input.subdivision)) {
    throw new RangeError('Subdivision must be 1, 2, 3, or 4.');
  }
  if (!Number.isSafeInteger(input.step) || input.step < 0 || input.step >= input.subdivision) {
    throw new RangeError('Subdivision step is outside the beat.');
  }
  const beatUnits = (input.beat - 1) * input.subdivision + input.step;
  return createRationalDuration(
    grid.beatDuration.numerator * beatUnits,
    grid.beatDuration.denominator * input.subdivision,
  );
};

export const friendlyBeatFromRational = (
  grid: MeterBeatGrid,
  offset: RationalDuration,
): FriendlyBeatPosition => {
  const offsetValue = offset.numerator / offset.denominator;
  const beatValue = grid.beatDuration.numerator / grid.beatDuration.denominator;
  const zeroBasedBeat = Math.max(0, Math.min(grid.beats - 1, Math.floor(offsetValue / beatValue)));
  const withinBeat = Math.max(0, offsetValue / beatValue - zeroBasedBeat);
  for (const subdivision of [1, 2, 3, 4] as const) {
    const step = Math.round(withinBeat * subdivision);
    if (step < subdivision && Math.abs(step / subdivision - withinBeat) < 1e-10) {
      return { beat: zeroBasedBeat + 1, subdivision, step };
    }
  }
  return { beat: zeroBasedBeat + 1, subdivision: 4, step: 0 };
};
