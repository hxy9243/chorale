import type {
  Annotation,
  MusicalPosition,
  RationalDuration,
} from '../types/document';

export type SvgLocalBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RenderedScoreSystem = Readonly<{
  id: string;
  viewBox: string;
}>;

export type RenderedMeasureGeometry = Readonly<{
  measure: number;
  systemId: string;
  bounds: SvgLocalBounds;
}>;

export type RenderedEventGeometry = Readonly<{
  position: MusicalPosition;
  systemId: string;
  bounds: SvgLocalBounds;
  abcRange?: Readonly<{ start: number; end: number }>;
}>;

export type AnnotationTrack = 'chord' | 'modulation' | 'voice-leading' | 'explanation';

export type AnnotationPlacement = Readonly<{
  id: string;
  annotationId: string;
  systemId: string;
  track: AnnotationTrack;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  body: string;
  chordSymbol?: string;
  romanNumeral?: string;
}>;

export type AnnotationLayoutInput = Readonly<{
  annotations: readonly Annotation[];
  systems: readonly RenderedScoreSystem[];
  measures: readonly RenderedMeasureGeometry[];
  events: readonly RenderedEventGeometry[];
}>;

const rationalValue = ({ numerator, denominator }: RationalDuration) => numerator / denominator;

const equalPosition = (left: MusicalPosition, right: MusicalPosition) => (
  left.measure === right.measure
  && left.offset.numerator * right.offset.denominator
    === right.offset.numerator * left.offset.denominator
);

const horizontalEventPosition = (
  position: MusicalPosition,
  events: readonly RenderedEventGeometry[],
  measure: RenderedMeasureGeometry,
) => {
  const matching = events
    .filter((event) => event.systemId === measure.systemId && equalPosition(event.position, position))
    .sort((left, right) => left.bounds.y - right.bounds.y);
  if (matching.length > 0) return matching[0].bounds.x + matching[0].bounds.width / 2;

  const inMeasure = events
    .filter((event) => (
      event.systemId === measure.systemId
      && event.position.measure === position.measure
    ))
    .sort((left, right) => rationalValue(left.position.offset) - rationalValue(right.position.offset));
  const target = rationalValue(position.offset);
  const before = inMeasure
    .filter((event) => rationalValue(event.position.offset) < target)
    .sort((left, right) => (
      rationalValue(right.position.offset) - rationalValue(left.position.offset)
      || left.bounds.y - right.bounds.y
    ))[0];
  const after = inMeasure
    .filter((event) => rationalValue(event.position.offset) > target)
    .sort((left, right) => (
      rationalValue(left.position.offset) - rationalValue(right.position.offset)
      || left.bounds.y - right.bounds.y
    ))[0];
  if (before && after) {
    const beforeValue = rationalValue(before.position.offset);
    const afterValue = rationalValue(after.position.offset);
    const fraction = (target - beforeValue) / (afterValue - beforeValue);
    const beforeX = before.bounds.x + before.bounds.width / 2;
    const afterX = after.bounds.x + after.bounds.width / 2;
    return beforeX + (afterX - beforeX) * fraction;
  }
  if (before) return before.bounds.x + before.bounds.width;
  if (after) return after.bounds.x;
  return measure.bounds.x + measure.bounds.width / 2;
};

const rangePlacements = (
  annotation: Annotation,
  measures: readonly RenderedMeasureGeometry[],
): AnnotationPlacement[] => {
  const covered = measures.filter(({ measure }) => (
    measure >= annotation.span.startMeasure && measure <= annotation.span.endMeasure
  ));
  const bySystem = new Map<string, RenderedMeasureGeometry[]>();
  for (const measure of covered) {
    const group = bySystem.get(measure.systemId) || [];
    group.push(measure);
    bySystem.set(measure.systemId, group);
  }

  return [...bySystem].map(([systemId, group], index) => {
    const left = Math.min(...group.map(({ bounds }) => bounds.x));
    const right = Math.max(...group.map(({ bounds }) => bounds.x + bounds.width));
    const top = Math.min(...group.map(({ bounds }) => bounds.y));
    const bottom = Math.max(...group.map(({ bounds }) => bounds.y + bounds.height));
    if (annotation.kind === 'modulation') {
      return {
        id: `${annotation.id}:${systemId}:${index}`,
        annotationId: annotation.id,
        systemId,
        track: annotation.kind,
        x: left,
        y: Math.max(1, top - 18),
        width: Math.max(1, right - left),
        height: 14,
        label: annotation.label,
        body: annotation.body,
      };
    }
    if (annotation.kind === 'voice-leading') {
      return {
        id: `${annotation.id}:${systemId}:${index}`,
        annotationId: annotation.id,
        systemId,
        track: annotation.kind,
        x: left,
        y: bottom + 6,
        width: Math.max(1, right - left),
        height: 18,
        label: annotation.label,
        body: annotation.body,
      };
    }
    return {
      id: `${annotation.id}:${systemId}:${index}`,
      annotationId: annotation.id,
      systemId,
      track: 'explanation',
      x: right + 4,
      y: top,
      width: 22,
      height: Math.max(18, bottom - top),
      label: annotation.label,
      body: annotation.body,
    };
  });
};

export const projectAnnotations = ({
  annotations,
  systems,
  measures,
  events,
}: AnnotationLayoutInput): AnnotationPlacement[] => {
  const systemIds = new Set(systems.map(({ id }) => id));
  const availableMeasures = measures.filter(({ systemId }) => systemIds.has(systemId));
  const placements: AnnotationPlacement[] = [];

  for (const annotation of annotations) {
    if (annotation.kind !== 'chord') {
      placements.push(...rangePlacements(annotation, availableMeasures));
      continue;
    }
    const measure = availableMeasures.find((candidate) => (
      candidate.measure === annotation.position.measure
    ));
    if (!measure) continue;
    placements.push({
      id: `${annotation.id}:${measure.systemId}:0`,
      annotationId: annotation.id,
      systemId: measure.systemId,
      track: 'chord',
      x: horizontalEventPosition(annotation.position, events, measure),
      y: Math.max(1, measure.bounds.y - 28),
      width: 1,
      height: 24,
      label: annotation.label,
      body: annotation.body,
      chordSymbol: annotation.chordSymbol,
      ...(annotation.romanNumeral ? { romanNumeral: annotation.romanNumeral } : {}),
    });
  }

  return placements;
};
