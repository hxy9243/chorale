import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import type { Annotation } from '../types/document';
import { extractScore, type MeasuredScoreEvent } from '../music/scoreSnapshot';
import {
  projectAnnotations,
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

type OverlayLayout = Readonly<{
  systems: PositionedSystem[];
  placements: AnnotationPlacement[];
}>;

interface AnnotationOverlayProps {
  paperRef: React.RefObject<HTMLDivElement | null>;
  abcCode: string;
  annotations: readonly Annotation[];
  tune: abcjs.TuneObject | null;
  renderGeneration: number;
  zoom: number;
  activeAnnotationId?: string | null;
  onActivate(annotation: Annotation): void;
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

const measureBounds = (
  svg: SVGSVGElement,
  measureNumber: number,
  elements: readonly SVGGraphicsElement[],
): SvgLocalBounds | null => {
  const content = unionBounds(elements.flatMap((element) => {
    const bounds = safeBounds(element);
    return bounds ? [bounds] : [];
  }));
  if (!content) return null;
  const lineClass = elements.flatMap((element) => Array.from(element.classList))
    .find((className) => /^abcjs-l\d+$/.test(className));
  const staff = lineClass
    ? svg.querySelector<SVGGraphicsElement>(`.abcjs-staff.${lineClass}`)
    : null;
  const staffBounds = staff ? safeBounds(staff) : null;
  const previousBar = lineClass && measureNumber > 1
    ? svg.querySelector<SVGGraphicsElement>(
        `.abcjs-mm${measureNumber - 2}.abcjs-bar.${lineClass}`,
      )
    : null;
  const previousBounds = previousBar ? safeBounds(previousBar) : null;
  const endBarBounds = elements
    .filter((element) => element.classList.contains('abcjs-bar'))
    .flatMap((element) => {
      const bounds = safeBounds(element);
      return bounds ? [bounds] : [];
    })
    .sort((left, right) => right.x - left.x)[0];
  const left = previousBounds
    ? previousBounds.x + previousBounds.width
    : staffBounds?.x ?? content.x;
  const right = endBarBounds?.x ?? content.x + content.width;
  return {
    x: left,
    y: staffBounds?.y ?? content.y,
    width: Math.max(1, right - left),
    height: staffBounds?.height ?? content.height,
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

const captureLayout = (
  paper: HTMLDivElement,
  abcCode: string,
  annotations: readonly Annotation[],
  tune: abcjs.TuneObject | null,
  zoom: number,
): OverlayLayout => {
  const wrapper = paper.parentElement;
  if (!wrapper || !abcCode.trim() || annotations.length === 0) {
    return { systems: [], placements: [] };
  }
  const scale = zoom / 100 || 1;
  const wrapperRect = wrapper.getBoundingClientRect();
  const sourceSvgs = Array.from(paper.querySelectorAll<SVGSVGElement>('svg'));
  const systems: PositionedSystem[] = sourceSvgs.map((svg, index) => {
    const rect = svg.getBoundingClientRect();
    const width = rect.width / scale;
    const height = rect.height / scale;
    return {
      id: `score-system-${index}`,
      viewBox: svg.getAttribute('viewBox') || `0 0 ${width} ${height}`,
      left: (rect.left - wrapperRect.left) / scale,
      top: (rect.top - wrapperRect.top) / scale,
      width,
      height,
    };
  });
  const systemBySvg = new Map(sourceSvgs.map((svg, index) => [svg, systems[index]]));
  const { score, events: sourceEvents } = sourceEventsByStart(abcCode);

  const measures: RenderedMeasureGeometry[] = [];
  for (const measure of score.measures) {
    for (const [index, svg] of sourceSvgs.entries()) {
      const elements = Array.from(svg.querySelectorAll<SVGGraphicsElement>(
        `.abcjs-mm${measure.measureNumber - 1}`,
      ));
      const bounds = measureBounds(svg, measure.measureNumber, elements);
      if (bounds) {
        measures.push({ measure: measure.measureNumber, systemId: systems[index].id, bounds });
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
    placements: projectAnnotations({ annotations, systems, measures, events }),
  };
};

const annotationForPlacement = (
  annotations: readonly Annotation[],
  placement: AnnotationPlacement,
) => annotations.find(({ id }) => id === placement.annotationId);

const handleKeyboardActivation = (
  event: React.KeyboardEvent<SVGGElement>,
  activate: () => void,
) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activate();
};

const PlacementNode: React.FC<{
  placement: AnnotationPlacement;
  active: boolean;
  onActivate(): void;
}> = ({ placement, active, onActivate }) => {
  const common = {
    className: `annotation-overlay-node ${placement.track} ${active ? 'active' : 'inactive'}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': `Edit ${placement.label} annotation`,
    'data-annotation-id': placement.annotationId,
    onClick: onActivate,
    onFocus: onActivate,
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => handleKeyboardActivation(event, onActivate),
  };

  if (placement.track === 'chord') {
    return (
      <g {...common} transform={`translate(${placement.x} ${placement.y})`}>
        <title>{placement.body}</title>
        <text className="annotation-chord-symbol" textAnchor="middle">{placement.chordSymbol}</text>
        {placement.romanNumeral && (
          <text className="annotation-roman-numeral" y="11" textAnchor="middle">{placement.romanNumeral}</text>
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
  zoom,
  activeAnnotationId = null,
  onActivate,
}) => {
  const [layout, setLayout] = useState<OverlayLayout>({ systems: [], placements: [] });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        try {
          setLayout(captureLayout(paper, abcCode, annotations, tune, zoom));
        } catch {
          setLayout({ systems: [], placements: [] });
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
    const observer = new ResizeObserver(schedule);
    observer.observe(paper.parentElement || paper);
    paper.querySelectorAll('svg').forEach((svg) => observer.observe(svg));
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [abcCode, annotations, paperRef, renderGeneration, tune, zoom]);

  return (
    <div className="annotation-overlay-layer" aria-label="Score annotation overlay">
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
          {layout.placements.filter(({ systemId }) => systemId === system.id).map((placement) => {
            const annotation = annotationForPlacement(annotations, placement);
            if (!annotation) return null;
            return (
              <PlacementNode
                key={placement.id}
                placement={placement}
                active={placement.annotationId === activeAnnotationId}
                onActivate={() => onActivate(annotation)}
              />
            );
          })}
        </svg>
      ))}
    </div>
  );
};
