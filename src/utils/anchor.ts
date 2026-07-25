import type { ScoreAnchor } from '../types/document';

export function formatAnchorLabel(anchor: ScoreAnchor | null | undefined): string {
  if (!anchor) return '';
  if (anchor.label) return anchor.label;

  const measureText = anchor.endMeasure && anchor.endMeasure !== anchor.measure
    ? `m. ${anchor.measure}–${anchor.endMeasure}`
    : `m. ${anchor.measure}`;

  if (anchor.beat !== undefined) {
    return `${measureText}, beat ${anchor.beat}`;
  }

  return measureText;
}

export function isSameAnchor(a: ScoreAnchor | null | undefined, b: ScoreAnchor | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.measure === b.measure &&
    a.endMeasure === b.endMeasure &&
    a.beat === b.beat &&
    a.abcOffset === b.abcOffset
  );
}
