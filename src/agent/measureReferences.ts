import type { ScoreAnchor } from '../types/document';

const MEASURE_REFERENCE = /^#measure-([1-9]\d*)(?:-([1-9]\d*))?$/;

export const parseMeasureReference = (
  href: string | undefined,
  totalMeasures: number,
): ScoreAnchor | null => {
  if (!href || !Number.isSafeInteger(totalMeasures) || totalMeasures <= 0) return null;
  const match = href.match(MEASURE_REFERENCE);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2] || match[1]);
  if (
    !Number.isSafeInteger(first)
    || !Number.isSafeInteger(second)
    || first > totalMeasures
    || second > totalMeasures
  ) {
    return null;
  }
  return {
    startMeasure: Math.min(first, second),
    endMeasure: Math.max(first, second),
  };
};
