import type { ScoreAnchor } from '../types/document';

export function formatAnchorLabel(anchor: ScoreAnchor | null | undefined): string {
  if (!anchor) return '';
  if (anchor.label) return anchor.label;

  const measureText = anchor.endMeasure !== anchor.startMeasure
    ? `mm. ${anchor.startMeasure}–${anchor.endMeasure}`
    : `m. ${anchor.startMeasure}`;

  if (anchor.beat !== undefined) {
    return `${measureText}, beat ${anchor.beat}`;
  }

  return measureText;
}

export function isSameAnchor(a: ScoreAnchor | null | undefined, b: ScoreAnchor | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.startMeasure === b.startMeasure &&
    a.endMeasure === b.endMeasure &&
    a.beat === b.beat &&
    a.abcOffset === b.abcOffset
  );
}
