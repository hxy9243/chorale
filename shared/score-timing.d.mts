export type Rational = Readonly<{ num: number; den: number }>;
export function createRational(num: number, den?: number): Rational;
export function fromNumber(value: number, maximumDenominator?: number): Rational;
export function addRational(left: Rational, right: Rational): Rational;
export function subRational(left: Rational, right: Rational): Rational;
export function compareRational(left: Rational, right: Rational): -1 | 0 | 1;
export function rationalToText(value: Rational): string;
export class UnsupportedScoreTimingError extends Error { code: string; constructor(message: string, code?: string); }
export type ScoreMeasureMapping = {
  isPickup: boolean;
  firstMeasureNumber: number;
  totalMeasures: number;
  barToMeasure: number[];
  measureToBars: Map<number, number[]>;
  splitMeasures: Set<number>;
};
export type TimingEntry<Element = Record<string, unknown>> = {
  element: Element;
  segmentIndex: number;
  staffKey: unknown;
  staffClef: unknown;
  staffMeter: unknown;
  measure: number;
  offset: Rational;
  absoluteOffset: Rational;
  duration: Rational;
};
export type ScoreTiming<Element = Record<string, unknown>> = {
  measures: { measure: number; start: Rational; duration: Rational }[];
  voices: { voiceId: string; entries: TimingEntry<Element>[]; barToMeasure: number[] }[];
  mapping: ScoreMeasureMapping;
};
export function buildScoreTiming<Element>(tune: {
  lines?: readonly { staff?: readonly { voices?: readonly (readonly Element[])[]; key?: unknown; clef?: unknown; meter?: unknown }[] }[];
  getMeter?: () => unknown;
}, options?: { voiceIdFor?: (voice: readonly Element[], slot: number) => string }): ScoreTiming<Element>;
export function computeScoreMeasureMapping<Element>(tune: Parameters<typeof buildScoreTiming<Element>>[0],
  options?: { voiceIdFor?: (voice: readonly Element[], slot: number) => string }): ScoreMeasureMapping;
