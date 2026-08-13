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
  lineId?: string;
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
  lineId?: string;
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

export type ChordBadgeInterval = Readonly<{
  id: string;
  systemId: string;
  lineId?: string;
  centerX: number;
  width: number;
  minX?: number;
  maxX?: number;
}>;

export type PackedChordBadge = ChordBadgeInterval & Readonly<{
  lane: number;
  left: number;
  right: number;
}>;

export type ChordStaffSpacing = Readonly<{
  musicspace: number;
  staffsep: number;
}>;

export type AnnotationRailCardAnchor = Readonly<{
  id: string;
  targetY: number;
  height: number;
}>;

export type PositionedAnnotationRailCard = AnnotationRailCardAnchor & Readonly<{
  top: number;
  bottom: number;
}>;

export type AnnotationLayoutInput = Readonly<{
  annotations: readonly Annotation[];
  systems: readonly RenderedScoreSystem[];
  measures: readonly RenderedMeasureGeometry[];
  events: readonly RenderedEventGeometry[];
}>;

const rationalValue = ({ numerator, denominator }: RationalDuration) => numerator / denominator;

export const CHORD_BADGE_HEIGHT = 38;
export const CHORD_BADGE_GAP = 6;
export const CHORD_STAFF_CLEARANCE = 72;
const CHORD_SYSTEM_SEPARATION = 132;
export const ANNOTATION_RAIL_CARD_GAP = 12;

export const packChordBadgeIntervals = (
  intervals: readonly ChordBadgeInterval[],
  gap = CHORD_BADGE_GAP,
): PackedChordBadge[] => {
  const packed = new Map<string, PackedChordBadge>();
  const byLine = new Map<
    string,
    Array<Readonly<{ interval: ChordBadgeInterval; sourceIndex: number }>>
  >();

  for (const [sourceIndex, interval] of intervals.entries()) {
    const groupId = `${interval.systemId}:${interval.lineId || ''}`;
    const group = byLine.get(groupId) || [];
    group.push({ interval, sourceIndex });
    byLine.set(groupId, group);
  }

  for (const group of byLine.values()) {
    const ordered = [...group].sort((left, right) => (
      left.interval.centerX - right.interval.centerX || left.sourceIndex - right.sourceIndex
    ));

    const flushCluster = (
      cluster: Array<Readonly<{
        interval: ChordBadgeInterval;
        idealLeft: number;
        packedLeft: number;
        width: number;
      }>>,
    ) => {
      if (cluster.length === 0) return;
      const averageDisplacement = cluster.reduce(
        (total, item) => total + item.packedLeft - item.idealLeft,
        0,
      ) / cluster.length;
      let shift = -averageDisplacement;
      const minX = Math.max(...cluster.map(({ interval }) => interval.minX ?? -Infinity));
      const maxX = Math.min(...cluster.map(({ interval }) => interval.maxX ?? Infinity));
      const shiftedLeft = cluster[0].packedLeft + shift;
      const shiftedRight = cluster.at(-1)!.packedLeft + shift + cluster.at(-1)!.width;
      if (shiftedLeft < minX) shift += minX - shiftedLeft;
      if (shiftedRight > maxX) shift -= shiftedRight - maxX;

      for (const item of cluster) {
        const left = item.packedLeft + shift;
        packed.set(item.interval.id, {
          ...item.interval,
          width: item.width,
          lane: 0,
          left,
          right: left + item.width,
        });
      }
    };

    let cluster: Array<Readonly<{
      interval: ChordBadgeInterval;
      idealLeft: number;
      packedLeft: number;
      width: number;
    }>> = [];
    let packedRight = -Infinity;
    for (const { interval } of ordered) {
      const width = Math.max(1, interval.width);
      const idealLeft = interval.centerX - width / 2;
      if (cluster.length > 0 && idealLeft >= packedRight + gap) {
        flushCluster(cluster);
        cluster = [];
        packedRight = -Infinity;
      }
      const packedLeft = Math.max(idealLeft, packedRight + gap);
      cluster.push({ interval, idealLeft, packedLeft, width });
      packedRight = packedLeft + width;
    }
    flushCluster(cluster);
  }

  return intervals.flatMap((interval) => {
    const result = packed.get(interval.id);
    return result ? [result] : [];
  });
};

export const requiredChordLaneCount = (badges: readonly PackedChordBadge[]) => (
  badges.reduce((count, badge) => Math.max(count, badge.lane + 1), 0)
);

export const chordStaffSpacing = (): ChordStaffSpacing => {
  const reservedHeight = CHORD_BADGE_HEIGHT;
  return {
    musicspace: reservedHeight + CHORD_STAFF_CLEARANCE,
    staffsep: CHORD_SYSTEM_SEPARATION,
  };
};

export const packAnnotationRailCards = (
  anchors: readonly AnnotationRailCardAnchor[],
  gap = ANNOTATION_RAIL_CARD_GAP,
  minTop = 0,
): PositionedAnnotationRailCard[] => {
  const positioned = new Map<string, PositionedAnnotationRailCard>();
  const ordered = anchors
    .map((anchor, sourceIndex) => ({ anchor, sourceIndex }))
    .sort((left, right) => (
      left.anchor.targetY - right.anchor.targetY || left.sourceIndex - right.sourceIndex
    ));

  const flushCluster = (
    cluster: Array<Readonly<{
      anchor: AnnotationRailCardAnchor;
      desiredTop: number;
      packedTop: number;
      height: number;
    }>>,
  ) => {
    if (cluster.length === 0) return;
    const averageDisplacement = cluster.reduce(
      (total, item) => total + item.packedTop - item.desiredTop,
      0,
    ) / cluster.length;
    const shift = Math.max(-averageDisplacement, minTop - cluster[0].packedTop);
    for (const item of cluster) {
      const top = item.packedTop + shift;
      positioned.set(item.anchor.id, {
        ...item.anchor,
        height: item.height,
        top,
        bottom: top + item.height,
      });
    }
  };

  let cluster: Array<Readonly<{
    anchor: AnnotationRailCardAnchor;
    desiredTop: number;
    packedTop: number;
    height: number;
  }>> = [];
  let packedBottom = -Infinity;
  for (const { anchor } of ordered) {
    const height = Math.max(0, anchor.height);
    const desiredTop = anchor.targetY - height / 2;
    if (cluster.length > 0 && desiredTop >= packedBottom + gap) {
      flushCluster(cluster);
      cluster = [];
      packedBottom = -Infinity;
    }
    const packedTop = Math.max(desiredTop, packedBottom + gap);
    cluster.push({ anchor, desiredTop, packedTop, height });
    packedBottom = packedTop + height;
  }
  flushCluster(cluster);

  return anchors.flatMap((anchor) => {
    const result = positioned.get(anchor.id);
    return result ? [result] : [];
  });
};

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
  if (rationalValue(position.offset) === 0) return measure.bounds.x;

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
  const byLine = new Map<string, RenderedMeasureGeometry[]>();
  for (const measure of covered) {
    const groupId = `${measure.systemId}:${measure.lineId || ''}`;
    const group = byLine.get(groupId) || [];
    group.push(measure);
    byLine.set(groupId, group);
  }

  return [...byLine.values()].map((group, index) => {
    const { systemId, lineId } = group[0];
    const left = Math.min(...group.map(({ bounds }) => bounds.x));
    const right = Math.max(...group.map(({ bounds }) => bounds.x + bounds.width));
    const top = Math.min(...group.map(({ bounds }) => bounds.y));
    const bottom = Math.max(...group.map(({ bounds }) => bounds.y + bounds.height));
    if (annotation.kind === 'modulation') {
      return {
        id: `${annotation.id}:${systemId}:${index}`,
        annotationId: annotation.id,
        systemId,
        ...(lineId ? { lineId } : {}),
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
        ...(lineId ? { lineId } : {}),
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
      ...(lineId ? { lineId } : {}),
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
      ...(measure.lineId ? { lineId: measure.lineId } : {}),
      track: 'chord',
      x: horizontalEventPosition(annotation.position, events, measure),
      y: measure.bounds.y,
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
