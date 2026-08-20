import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import type { Annotation } from '../types/document';
import { extractScore, type MeasuredScoreEvent } from '../music/scoreSnapshot';
import {
  projectAnnotations,
  CHORD_BADGE_GAP,
  CHORD_BADGE_HEIGHT,
  CHORD_STAFF_CLEARANCE,
  packChordBadgeIntervals,
  type AnnotationPlacement,
  type RenderedEventGeometry,
  type RenderedMeasureGeometry,
  type RenderedScoreSystem,
  type SvgLocalBounds,
} from '../music/annotationLayout';

type EngravedSelectable = {
  absEl?: { abcelem?: { startChar?: number } };
  svgEl?: SVGGraphicsElement;
};

type TuneWithEngraver = abcjs.TuneObject & {
  engraver?: { selectables?: EngravedSelectable[] };
};

type PositionedSystem = RenderedScoreSystem & Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type ScoreGeometry = Readonly<{
  systems: PositionedSystem[];
  measures: RenderedMeasureGeometry[];
  events: RenderedEventGeometry[];
  obstacles: ReadonlyArray<Readonly<{
    systemId: string;
    lineId?: string;
    bounds: SvgLocalBounds;
  }>>;
}>;

type OverlayLayout = ScoreGeometry & Readonly<{
  placements: AnnotationPlacement[];
}>;

export type AnnotationRailGeometry = Readonly<{
  anchorYByAnnotationId: Readonly<Record<string, number>>;
  scoreHeight: number;
}>;

interface AnnotationOverlayProps {
  paperRef: React.RefObject<HTMLDivElement | null>;
  abcCode: string;
  annotations: readonly Annotation[];
  tune: abcjs.TuneObject | null;
  renderGeneration: number;
  activeAnnotationId?: string | null;
  inlineChordEditor?: React.ReactNode;
  onActivate(annotation: Annotation, initiator: SVGGElement): void;
  onRangeGeometry?(geometry: AnnotationRailGeometry): void;
}

const safeBounds = (element: SVGGraphicsElement): SvgLocalBounds | null => {
  try {
    const bounds = element.getBBox();
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  } catch {
    return null;
  }
};

const unionBounds = (bounds: readonly SvgLocalBounds[]): SvgLocalBounds | null => {
  if (bounds.length === 0) return null;
  const x = Math.min(...bounds.map((box) => box.x));
  const y = Math.min(...bounds.map((box) => box.y));
  const right = Math.max(...bounds.map((box) => box.x + box.width));
  const bottom = Math.max(...bounds.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
};

const SCORE_TEXT_OBSTACLE_SELECTOR = [
  '.abcjs-annotation',
  '.abcjs-tempo',
  '.abcjs-part',
  '.abcjs-dynamics',
  '.abcjs-chord',
  '.abcjs-ending',
  '.abcjs-bar-number',
  '.chorale-line-measure-number',
].join(',');

const screenBoundsInSvg = (
  svg: SVGSVGElement,
  element: SVGGraphicsElement,
): SvgLocalBounds | null => {
  const svgRect = svg.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const [viewBoxX = 0, viewBoxY = 0, viewBoxWidth = svgRect.width, viewBoxHeight = svgRect.height]
    = (svg.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
  if (
    svgRect.width <= 0
    || svgRect.height <= 0
    || ![viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight].every(Number.isFinite)
  ) return safeBounds(element);
  const scaleX = viewBoxWidth / svgRect.width;
  const scaleY = viewBoxHeight / svgRect.height;
  return {
    x: viewBoxX + (elementRect.left - svgRect.left) * scaleX,
    y: viewBoxY + (elementRect.top - svgRect.top) * scaleY,
    width: elementRect.width * scaleX,
    height: elementRect.height * scaleY,
  };
};

const measureBounds = (
  svg: SVGSVGElement,
  measureNumber: number,
  elements: readonly SVGGraphicsElement[],
): Readonly<{ bounds: SvgLocalBounds; lineId?: string }> | null => {
  const endBar = elements
    .filter((element) => element.classList.contains('abcjs-bar'))
    .flatMap((element) => {
      const bounds = safeBounds(element);
      return bounds ? [{ element, bounds }] : [];
    })
    .sort((left, right) => right.bounds.x - left.bounds.x)[0];
  const lineId = endBar
    ? Array.from(endBar.element.classList).find((className) => /^abcjs-l\d+$/.test(className))
    : elements.flatMap((element) => Array.from(element.classList))
      .find((className) => /^abcjs-l\d+$/.test(className));
  const lineElements = lineId
    ? elements.filter((element) => element.classList.contains(lineId))
    : elements;
  const content = unionBounds(lineElements.flatMap((element) => {
    const bounds = safeBounds(element);
    return bounds ? [bounds] : [];
  }));
  if (!content) return null;
  const staffBounds = lineId
    ? Array.from(svg.querySelectorAll<SVGGraphicsElement>(`.abcjs-staff.${lineId}`))
      .flatMap((staff) => {
        const bounds = safeBounds(staff);
        return bounds ? [bounds] : [];
      })
      .sort((left, right) => left.y - right.y)[0]
    : null;
  const previousBar = lineId && measureNumber > 1
    ? svg.querySelector<SVGGraphicsElement>(
        `.abcjs-mm${measureNumber - 2}.abcjs-bar.${lineId}`,
      )
    : null;
  const previousBounds = previousBar ? safeBounds(previousBar) : null;
  const left = previousBounds
    ? previousBounds.x + previousBounds.width
    : staffBounds?.x ?? content.x;
  const right = endBar?.bounds.x ?? content.x + content.width;
  return {
    ...(lineId ? { lineId } : {}),
    bounds: {
      x: left,
      y: staffBounds?.y ?? content.y,
      width: Math.max(1, right - left),
      height: staffBounds?.height ?? content.height,
    },
  };
};

const sourceEventsByStart = (abcCode: string) => {
  const events = new Map<number, MeasuredScoreEvent[]>();
  const score = extractScore(abcCode);
  for (const measure of score.measures) {
    for (const event of measure.events) {
      if (!event.abcRange) continue;
      const matching = events.get(event.abcRange.start) || [];
      matching.push(event);
      events.set(event.abcRange.start, matching);
    }
  }
  return { score, events };
};

const captureScoreGeometry = (
  paper: HTMLDivElement,
  abcCode: string,
  tune: abcjs.TuneObject | null,
): ScoreGeometry => {
  const wrapper = paper.parentElement;
  if (!wrapper || !abcCode.trim()) {
    return { systems: [], measures: [], events: [], obstacles: [] };
  }
  const wrapperRect = wrapper.getBoundingClientRect();
  const scaleX = wrapper.offsetWidth > 0 && wrapperRect.width > 0
    ? wrapperRect.width / wrapper.offsetWidth
    : 1;
  // Sheet and interface zoom are both uniform transforms. Reuse the horizontal
  // ratio so integer-rounded offsetHeight cannot introduce a false vertical
  // scale and split annotations that share the same staff baseline.
  const scaleY = scaleX;
  const sourceSvgs = Array.from(paper.querySelectorAll<SVGSVGElement>('svg'));
  const systems: PositionedSystem[] = sourceSvgs.map((svg, index) => {
    const rect = svg.getBoundingClientRect();
    const width = rect.width / scaleX;
    const height = rect.height / scaleY;
    return {
      id: `score-system-${index}`,
      viewBox: svg.getAttribute('viewBox') || `0 0 ${width} ${height}`,
      left: (rect.left - wrapperRect.left) / scaleX,
      top: (rect.top - wrapperRect.top) / scaleY,
      width,
      height,
    };
  });
  const systemBySvg = new Map(sourceSvgs.map((svg, index) => [svg, systems[index]]));
  const { score, events: sourceEvents } = sourceEventsByStart(abcCode);

  const obstacles = sourceSvgs.flatMap((svg, index) => (
    Array.from(svg.querySelectorAll<SVGGraphicsElement>(SCORE_TEXT_OBSTACLE_SELECTOR))
      .filter((element) => !element.parentElement?.closest(SCORE_TEXT_OBSTACLE_SELECTOR))
      .flatMap((element) => {
        const bounds = screenBoundsInSvg(svg, element);
        if (!bounds) return [];
        const lineId = Array.from(element.classList)
          .find((className) => /^abcjs-l\d+$/.test(className));
        return [{
          systemId: systems[index].id,
          ...(lineId ? { lineId } : {}),
          bounds,
        }];
      })
  ));

  const measures: RenderedMeasureGeometry[] = [];
  for (const measure of score.measures) {
    for (const [index, svg] of sourceSvgs.entries()) {
      const elements = Array.from(svg.querySelectorAll<SVGGraphicsElement>(
        `.abcjs-mm${measure.measureNumber - 1}`,
      ));
      const geometry = measureBounds(svg, measure.measureNumber, elements);
      if (geometry) {
        measures.push({
          measure: measure.measureNumber,
          systemId: systems[index].id,
          ...(geometry.lineId ? { lineId: geometry.lineId } : {}),
          bounds: geometry.bounds,
        });
      }
    }
  }

  const events: RenderedEventGeometry[] = [];
  for (const selectable of (tune as TuneWithEngraver | null)?.engraver?.selectables || []) {
    const start = selectable.absEl?.abcelem?.startChar;
    const element = selectable.svgEl;
    if (!Number.isInteger(start) || !element) continue;
    const svg = element.closest('svg');
    if (!(svg instanceof SVGSVGElement)) continue;
    const system = systemBySvg.get(svg);
    const bounds = safeBounds(element);
    if (!system || !bounds) continue;
    for (const event of sourceEvents.get(start!) || []) {
      events.push({
        position: event.position,
        systemId: system.id,
        bounds,
        ...(event.abcRange ? { abcRange: event.abcRange } : {}),
      });
    }
  }

  // Some abcjs builds omit engraver.selectables. Keep written identity by
  // pairing parsed event order with selectable note geometry inside each measure.
  if (events.length === 0) {
    for (const measure of score.measures) {
      const renderedMeasure = measures.find(({ measure: number }) => number === measure.measureNumber);
      const system = systems.find(({ id }) => id === renderedMeasure?.systemId);
      const svg = system ? sourceSvgs[systems.indexOf(system)] : undefined;
      if (!renderedMeasure || !svg) continue;
      const noteBounds = Array.from(svg.querySelectorAll<SVGGraphicsElement>(
        `.abcjs-mm${measure.measureNumber - 1}.abcjs-note`,
      )).flatMap((element) => {
        const bounds = safeBounds(element);
        return bounds ? [bounds] : [];
      }).sort((left, right) => left.x - right.x || left.y - right.y);
      const positions = measure.events.filter((event, index, all) => (
        index === all.findIndex((candidate) => (
          candidate.position.offset.numerator * event.position.offset.denominator
            === event.position.offset.numerator * candidate.position.offset.denominator
        ))
      ));
      positions.slice(0, noteBounds.length).forEach((event, index) => {
        events.push({
          position: event.position,
          systemId: renderedMeasure.systemId,
          bounds: noteBounds[index],
          ...(event.abcRange ? { abcRange: event.abcRange } : {}),
        });
      });
    }
  }

  return {
    systems,
    measures,
    events,
    obstacles,
  };
};

const localYToWrapperY = (system: PositionedSystem, localY: number) => {
  const [, viewBoxY = 0, , viewBoxHeight = system.height] = system.viewBox
    .split(/[ ,]+/)
    .map(Number);
  const scale = viewBoxHeight > 0 ? system.height / viewBoxHeight : 1;
  return system.top + (localY - viewBoxY) * scale;
};

const localXToWrapperX = (system: PositionedSystem, localX: number) => {
  const [viewBoxX = 0, , viewBoxWidth = system.width] = system.viewBox
    .split(/[ ,]+/)
    .map(Number);
  const scale = viewBoxWidth > 0 ? system.width / viewBoxWidth : 1;
  return system.left + (localX - viewBoxX) * scale;
};

const rangeGeometry = (
  layout: OverlayLayout,
  annotations: readonly Annotation[],
): AnnotationRailGeometry => {
  const systems = new Map(layout.systems.map((system) => [system.id, system]));
  const anchorYByAnnotationId: Record<string, number> = {};
  for (const annotation of annotations) {
    if (annotation.kind === 'chord') continue;
    const centers = layout.measures.flatMap((measure) => {
      if (
        measure.measure < annotation.span.startMeasure
        || measure.measure > annotation.span.endMeasure
      ) return [];
      const system = systems.get(measure.systemId);
      return system
        ? [localYToWrapperY(system, measure.bounds.y + measure.bounds.height / 2)]
        : [];
    });
    if (centers.length > 0) {
      anchorYByAnnotationId[annotation.id] = (
        Math.min(...centers) + Math.max(...centers)
      ) / 2;
    }
  }
  return {
    anchorYByAnnotationId,
    scoreHeight: layout.systems.reduce(
      (height, system) => Math.max(height, system.top + system.height),
      0,
    ),
  };
};

const annotationForPlacement = (
  annotations: readonly Annotation[],
  placement: AnnotationPlacement,
) => annotations.find(({ id }) => id === placement.annotationId);

const handleKeyboardActivation = (
  event: React.KeyboardEvent<SVGGElement>,
  activate: (initiator: SVGGElement) => void,
) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activate(event.currentTarget);
};

const PlacementNode: React.FC<{
  placement: AnnotationPlacement;
  active: boolean;
  chordBadge?: Readonly<{ width: number; lane: number; left: number; top: number }>;
  onActivate(initiator: SVGGElement): void;
}> = ({ placement, active, chordBadge, onActivate }) => {
  const common = {
    className: `annotation-overlay-node ${placement.track} ${active ? 'active' : 'inactive'}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': `Edit ${placement.label} annotation`,
    'data-annotation-id': placement.annotationId,
    'data-edit-annotation': placement.annotationId,
    ...(placement.lineId ? { 'data-staff-line': placement.lineId } : {}),
    onClick: (event: React.MouseEvent<SVGGElement>) => onActivate(event.currentTarget),
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => handleKeyboardActivation(event, onActivate),
  };

  if (placement.track === 'chord' && chordBadge) {
    const top = chordBadge.top;
    const left = chordBadge.left;
    const textCenter = left + chordBadge.width / 2;
    return (
      <g {...common} data-chord-lane={chordBadge.lane} data-chord-baseline={top}>
        <title>{placement.body}</title>
        <rect
          className="annotation-chord-background"
          x={left}
          y={top}
          width={chordBadge.width}
          height={CHORD_BADGE_HEIGHT}
        />
        <text
          className="annotation-chord-symbol"
          x={textCenter}
          y={top + (placement.romanNumeral ? 20 : 25)}
          textAnchor="middle"
        >{placement.chordSymbol}</text>
        {placement.romanNumeral && (
          <text
            className="annotation-roman-numeral"
            x={textCenter}
            y={top + 34}
            textAnchor="middle"
          >{placement.romanNumeral}</text>
        )}
      </g>
    );
  }
  if (placement.track === 'modulation') {
    return (
      <g {...common}>
        <title>{placement.body}</title>
        <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx="4" />
        <text x={placement.x + 5} y={placement.y + 10}>{placement.label}</text>
      </g>
    );
  }
  if (placement.track === 'voice-leading') {
    return (
      <g {...common}>
        <title>{placement.body}</title>
        <path d={`M ${placement.x} ${placement.y} h ${placement.width}`} />
        <text x={placement.x + 4} y={placement.y + 13}>{placement.label}</text>
      </g>
    );
  }
  return (
    <g {...common}>
      <title>{placement.body}</title>
      <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx="5" />
      <text
        x={placement.x + placement.width / 2}
        y={placement.y + 13}
        textAnchor="middle"
        aria-hidden="true"
      >i</text>
    </g>
  );
};

export const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({
  paperRef,
  abcCode,
  annotations,
  tune,
  renderGeneration,
  activeAnnotationId = null,
  inlineChordEditor,
  onActivate,
  onRangeGeometry,
}) => {
  const [scoreGeometry, setScoreGeometry] = useState<ScoreGeometry | null>(null);
  const [chordWidths, setChordWidths] = useState<Record<string, number>>({});
  const frameRef = useRef<number | null>(null);
  const measurementRefs = useRef(new Map<string, SVGGElement>());
  const hasAnnotations = annotations.length > 0;
  const layout = useMemo<OverlayLayout>(() => {
    if (!scoreGeometry || !hasAnnotations) {
      return { systems: [], measures: [], events: [], placements: [], obstacles: [] };
    }
    return {
      ...scoreGeometry,
      placements: projectAnnotations({
        annotations,
        systems: scoreGeometry.systems,
        measures: scoreGeometry.measures,
        events: scoreGeometry.events,
      }),
    };
  }, [annotations, hasAnnotations, scoreGeometry]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    if (!hasAnnotations || !abcCode.trim()) {
      return;
    }
    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        try {
          setScoreGeometry(captureScoreGeometry(paper, abcCode, tune));
        } catch {
          setScoreGeometry(null);
        }
      });
    };
    schedule();
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      };
    }
    const observedSizes = new WeakMap<Element, Readonly<{ width: number; height: number }>>();
    const observer = new ResizeObserver((entries) => {
      // ResizeObserver may notify transformed descendants even though their
      // unscaled content box is unchanged. Only invalidate engraved geometry
      // when an observed content box actually changes.
      if (entries.length === 0) {
        schedule();
        return;
      }
      let changed = false;
      for (const entry of entries) {
        const size = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
        const previous = observedSizes.get(entry.target);
        observedSizes.set(entry.target, size);
        if (
          previous
          && (Math.abs(previous.width - size.width) > 0.01
            || Math.abs(previous.height - size.height) > 0.01)
        ) changed = true;
      }
      if (changed) schedule();
    });
    observer.observe(paper.parentElement || paper);
    paper.querySelectorAll('svg').forEach((svg) => observer.observe(svg));
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [abcCode, hasAnnotations, paperRef, renderGeneration, tune]);

  useEffect(() => {
    onRangeGeometry?.(rangeGeometry(layout, annotations));
  }, [annotations, layout, onRangeGeometry]);

  useLayoutEffect(() => {
    const widths: Record<string, number> = {};
    for (const placement of layout.placements) {
      if (placement.track !== 'chord') continue;
      const measured = safeBounds(measurementRefs.current.get(placement.id)!);
      const fallback = Math.max(
        placement.chordSymbol?.length || 0,
        placement.romanNumeral?.length || 0,
      ) * 12;
      widths[placement.id] = Math.max(54, (measured?.width || fallback) + 12);
    }
    setChordWidths((current) => {
      const keys = Object.keys(widths);
      if (
        keys.length === Object.keys(current).length
        && keys.every((key) => current[key] === widths[key])
      ) return current;
      return widths;
    });
  }, [layout]);

  const packedChords = useMemo(() => packChordBadgeIntervals(
    layout.placements.flatMap((placement) => (
      placement.track === 'chord' && chordWidths[placement.id]
        ? (() => {
            const system = layout.systems.find(({ id }) => id === placement.systemId);
            const [viewBoxX = 0, , viewBoxWidth = system?.width || 0] = (system?.viewBox || '')
              .split(/[ ,]+/)
              .map(Number);
            const lineMeasures = layout.measures.filter((measure) => (
              measure.systemId === placement.systemId
              && measure.lineId === placement.lineId
            ));
            const minX = lineMeasures.length > 0
              ? Math.min(...lineMeasures.map(({ bounds }) => bounds.x))
              : viewBoxX;
            const maxX = lineMeasures.length > 0
              ? Math.max(...lineMeasures.map(({ bounds }) => bounds.x + bounds.width))
              : viewBoxX + viewBoxWidth;
            return [{
              id: placement.id,
              systemId: placement.systemId,
              ...(placement.lineId ? { lineId: placement.lineId } : {}),
              centerX: placement.x + chordWidths[placement.id] / 2,
              width: chordWidths[placement.id],
              minX,
              maxX,
            }];
          })()
        : []
    )),
  ), [chordWidths, layout.measures, layout.placements, layout.systems]);
  const packedChordById = useMemo(
    () => new Map(packedChords.map((badge) => [badge.id, badge])),
    [packedChords],
  );
  const chordTopById = useMemo(() => {
    const candidateTops = new Map<string, number>();
    const lineTops = new Map<string, number>();

    for (const placement of layout.placements) {
      if (placement.track !== 'chord') continue;
      const badge = packedChordById.get(placement.id);
      if (!badge) continue;
      let top = placement.y - CHORD_STAFF_CLEARANCE - CHORD_BADGE_HEIGHT;
      const obstacles = layout.obstacles
        .filter((obstacle) => (
          obstacle.systemId === placement.systemId
          && obstacle.lineId === placement.lineId
          && badge.left < obstacle.bounds.x + obstacle.bounds.width + CHORD_BADGE_GAP
          && badge.right > obstacle.bounds.x - CHORD_BADGE_GAP
        ))
        .sort((left, right) => (
          right.bounds.y + right.bounds.height - left.bounds.y - left.bounds.height
        ));
      for (const obstacle of obstacles) {
        const obstacleTop = obstacle.bounds.y - CHORD_BADGE_GAP;
        const obstacleBottom = obstacle.bounds.y + obstacle.bounds.height + CHORD_BADGE_GAP;
        if (top < obstacleBottom && top + CHORD_BADGE_HEIGHT > obstacleTop) {
          top = obstacleTop - CHORD_BADGE_HEIGHT;
        }
      }
      const lineKey = `${placement.systemId}:${placement.lineId || ''}`;
      candidateTops.set(placement.id, top);
      lineTops.set(lineKey, Math.min(lineTops.get(lineKey) ?? top, top));
    }

    return new Map(layout.placements.flatMap((placement) => {
      const candidateTop = candidateTops.get(placement.id);
      if (candidateTop === undefined) return [];
      const lineKey = `${placement.systemId}:${placement.lineId || ''}`;
      return [[placement.id, lineTops.get(lineKey) ?? candidateTop] as const];
    }));
  }, [layout.obstacles, layout.placements, packedChordById]);
  const inlineEditorPosition = useMemo(() => {
    if (!inlineChordEditor || !activeAnnotationId) return null;
    const placement = layout.placements.find((candidate) => (
      candidate.track === 'chord' && candidate.annotationId === activeAnnotationId
    ));
    const badge = placement ? packedChordById.get(placement.id) : undefined;
    const system = placement
      ? layout.systems.find(({ id }) => id === placement.systemId)
      : undefined;
    if (!placement || !badge || !system) return null;
    const width = 240;
    const rawLeft = localXToWrapperX(system, badge.left);
    return {
      left: Math.max(system.left, Math.min(rawLeft, system.left + system.width - width)),
      top: localYToWrapperY(
        system,
        chordTopById.get(placement.id)
          ?? placement.y - CHORD_STAFF_CLEARANCE - CHORD_BADGE_HEIGHT,
      ),
      width,
    };
  }, [
    activeAnnotationId,
    chordTopById,
    inlineChordEditor,
    layout.placements,
    layout.systems,
    packedChordById,
  ]);

  return (
    <div
      className={`annotation-overlay-layer ${inlineEditorPosition ? 'editing-chord' : ''}`}
      aria-label="Score annotation overlay"
    >
      {layout.systems.map((system) => (
        <svg
          className="annotation-overlay-system"
          key={system.id}
          viewBox={system.viewBox}
          aria-label={`Annotations for ${system.id}`}
          style={{
            left: `${system.left}px`,
            top: `${system.top}px`,
            width: `${system.width}px`,
            height: `${system.height}px`,
          }}
        >
          <g className="annotation-chord-measurements" aria-hidden="true">
            {layout.placements
              .filter(({ systemId, track }) => systemId === system.id && track === 'chord')
              .map((placement) => (
                <g
                  key={`measure:${placement.id}`}
                  ref={(element) => {
                    if (element) measurementRefs.current.set(placement.id, element);
                    else measurementRefs.current.delete(placement.id);
                  }}
                >
                  <text className="annotation-chord-symbol" textAnchor="middle">
                    {placement.chordSymbol}
                  </text>
                  {placement.romanNumeral && (
                    <text className="annotation-roman-numeral" y="16" textAnchor="middle">
                      {placement.romanNumeral}
                    </text>
                  )}
                </g>
              ))}
          </g>
          {layout.placements.filter(({ systemId, track }) => (
            systemId === system.id && track === 'chord'
          )).map((placement) => {
            const annotation = annotationForPlacement(annotations, placement);
            if (!annotation) return null;
            const packedChord = placement.track === 'chord'
              ? packedChordById.get(placement.id)
              : undefined;
            if (placement.track === 'chord' && !packedChord) return null;
            return (
              <PlacementNode
                key={placement.id}
                placement={placement}
                active={placement.annotationId === activeAnnotationId}
                chordBadge={packedChord && {
                  width: packedChord.width,
                  lane: packedChord.lane,
                  left: packedChord.left,
                  top: chordTopById.get(placement.id)
                    ?? placement.y - CHORD_STAFF_CLEARANCE - CHORD_BADGE_HEIGHT,
                }}
                onActivate={(initiator) => onActivate(annotation, initiator)}
              />
            );
          })}
        </svg>
      ))}
      {inlineEditorPosition && (
        <section
          className="annotation-chord-inline-editor"
          style={inlineEditorPosition}
          aria-label="Chord annotation editor"
        >
          {inlineChordEditor}
        </section>
      )}
    </div>
  );
};
