import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, PenLine } from 'lucide-react';
import type { Annotation, AnnotationId, RangeAnnotation } from '../types/document';
import {
  ANNOTATION_RAIL_CARD_GAP,
  packAnnotationRailCards,
} from '../music/annotationLayout';

export type AnnotationRailEditor =
  | Readonly<{ mode: 'manual' }>
  | Readonly<{ mode: 'accepted'; annotationId: AnnotationId }>;

interface AnnotationRailProps {
  annotations: readonly Annotation[];
  editing: AnnotationRailEditor | null;
  editor: React.ReactNode;
  anchorYByAnnotationId?: Readonly<Record<string, number>>;
  scoreHeight?: number;
  onSelect(annotation: RangeAnnotation | null, initiator: HTMLButtonElement): void;
  onEdit(annotation: RangeAnnotation, initiator: HTMLButtonElement): void;
}

const KIND_ORDER: Record<RangeAnnotation['kind'], number> = {
  modulation: 0,
  'voice-leading': 1,
  explanation: 2,
};

const KIND_LABEL: Record<RangeAnnotation['kind'], string> = {
  modulation: 'Modulation',
  'voice-leading': 'Voice leading',
  explanation: 'Explanation',
};

const sortRangeAnnotations = (
  annotations: readonly Annotation[],
): RangeAnnotation[] => annotations
  .flatMap((annotation, index) => (
    annotation.kind === 'chord' ? [] : [{ annotation, index }]
  ))
  .sort((left, right) => (
    left.annotation.span.startMeasure - right.annotation.span.startMeasure
    || left.annotation.span.endMeasure - right.annotation.span.endMeasure
    || KIND_ORDER[left.annotation.kind] - KIND_ORDER[right.annotation.kind]
    || left.annotation.createdAt.localeCompare(right.annotation.createdAt)
    || left.index - right.index
  ))
  .map(({ annotation }) => annotation);

const measureLabel = ({ startMeasure, endMeasure }: RangeAnnotation['span']) => (
  startMeasure === endMeasure ? `m. ${startMeasure}` : `mm. ${startMeasure}–${endMeasure}`
);

export const AnnotationRail: React.FC<AnnotationRailProps> = ({
  annotations,
  editing,
  editor,
  anchorYByAnnotationId = {},
  scoreHeight = 0,
  onSelect,
  onEdit,
}) => {
  const rangeAnnotations = useMemo(() => sortRangeAnnotations(annotations), [annotations]);
  const [expandedId, setExpandedId] = useState<AnnotationId | null>(null);
  const [dismissedTooltipId, setDismissedTooltipId] = useState<AnnotationId | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<AnnotationId, HTMLElement>());
  const [cardLayout, setCardLayout] = useState<Readonly<{
    aligned: boolean;
    listHeight: number;
    topByAnnotationId: Readonly<Record<string, number>>;
  }>>({ aligned: false, listHeight: 0, topByAnnotationId: {} });

  useEffect(() => {
    if (expandedId && !rangeAnnotations.some(({ id }) => id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, rangeAnnotations]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const list = listRef.current;
    if (!rail || !list) return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const listTop = list.offsetTop;
      const anchors = rangeAnnotations.flatMap((annotation) => {
        const targetY = anchorYByAnnotationId[annotation.id];
        const card = cardRefs.current.get(annotation.id);
        return Number.isFinite(targetY) && card
          ? [{ id: annotation.id, targetY: targetY - listTop, height: card.offsetHeight }]
          : [];
      });
      const aligned = anchors.length > 0 && anchors.length === rangeAnnotations.length;
      const packed = aligned
        ? packAnnotationRailCards(anchors, ANNOTATION_RAIL_CARD_GAP, -listTop)
        : [];
      const topByAnnotationId = Object.fromEntries(packed.map(({ id, top }) => [id, top]));
      const packedBottom = packed.reduce((bottom, card) => Math.max(bottom, card.bottom), 0);
      const listHeight = aligned
        ? Math.max(0, scoreHeight - listTop, packedBottom)
        : 0;
      setCardLayout((current) => {
        const keys = Object.keys(topByAnnotationId);
        if (
          current.aligned === aligned
          && current.listHeight === listHeight
          && keys.length === Object.keys(current.topByAnnotationId).length
          && keys.every((key) => current.topByAnnotationId[key] === topByAnnotationId[key])
        ) return current;
        return { aligned, listHeight, topByAnnotationId };
      });
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(schedule);
    observer.observe(rail);
    observer.observe(list);
    cardRefs.current.forEach((card) => observer.observe(card));
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [anchorYByAnnotationId, editing, expandedId, rangeAnnotations, scoreHeight]);

  return (
    <aside
      ref={railRef}
      className="annotation-rail"
      aria-label="Annotations"
      data-annotation-rail-heading
      tabIndex={-1}
      style={{ '--annotation-score-height': `${scoreHeight}px` } as React.CSSProperties}
    >
      {editing?.mode === 'manual' && (
        <section className="annotation-rail-transient-editor" aria-label="New annotation">
          {editor}
        </section>
      )}

      {(
        <div
          ref={listRef}
          className="annotation-rail-list"
          data-score-aligned={cardLayout.aligned ? 'true' : 'false'}
          style={{ '--annotation-list-height': `${cardLayout.listHeight}px` } as React.CSSProperties}
        >
          {rangeAnnotations.map((annotation) => {
            const expanded = expandedId === annotation.id;
            const bodyId = `annotation-body-${annotation.id}`;
            return (
              <article
                key={annotation.id}
                ref={(element) => {
                  if (element) cardRefs.current.set(annotation.id, element);
                  else cardRefs.current.delete(annotation.id);
                }}
                className={`annotation-rail-card annotation-${annotation.kind}`}
                data-annotation-id={annotation.id}
                data-annotation-kind={annotation.kind}
                data-annotation-anchor-y={anchorYByAnnotationId[annotation.id]}
                data-selected={expanded ? 'true' : 'false'}
                style={cardLayout.aligned ? {
                  top: `${cardLayout.topByAnnotationId[annotation.id]}px`,
                } : undefined}
              >
                {editing?.mode === 'accepted' && editing.annotationId === annotation.id ? (
                  <section className="annotation-card-editor" aria-label={`${annotation.label} editor`}>
                    {editor}
                  </section>
                ) : (
                  <div className="annotation-card-row">
                    <button
                      type="button"
                      className="annotation-card-toggle"
                      aria-expanded={expanded}
                      aria-controls={bodyId}
                      onClick={(event) => {
                        setExpandedId(annotation.id);
                        onSelect(annotation, event.currentTarget);
                      }}
                    >
                      <span className="annotation-card-heading">
                        <span className="annotation-card-label">{annotation.label}</span>
                      </span>
                      <span className="annotation-card-meta">
                        <span>{KIND_LABEL[annotation.kind]}</span>
                        <span>{measureLabel(annotation.span)}</span>
                        {expanded && (
                          <span className="annotation-card-selected">
                            <Check aria-hidden="true" /> Selected
                          </span>
                        )}
                      </span>
                      <span
                        id={bodyId}
                        className={`annotation-card-body ${expanded ? 'expanded' : 'collapsed'}`}
                      >
                        {annotation.body}
                      </span>
                    </button>
                    {expanded && (
                      <button
                        type="button"
                        className="annotation-card-collapse"
                        aria-label={`Collapse ${annotation.label} annotation`}
                        aria-controls={bodyId}
                        onClick={(event) => {
                          const selectionButton = event.currentTarget.parentElement
                            ?.querySelector<HTMLButtonElement>('.annotation-card-toggle');
                          setExpandedId(null);
                          onSelect(null, selectionButton || event.currentTarget);
                        }}
                      >
                        <ChevronDown className="annotation-card-chevron" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="annotation-card-edit"
                      data-edit-annotation={annotation.id}
                      data-tooltip-dismissed={dismissedTooltipId === annotation.id ? 'true' : 'false'}
                      aria-label="Edit annotation"
                      onFocus={() => setDismissedTooltipId(null)}
                      onMouseLeave={() => setDismissedTooltipId(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setDismissedTooltipId(annotation.id);
                      }}
                      onClick={(event) => onEdit(annotation, event.currentTarget)}
                    >
                      <PenLine aria-hidden="true" />
                      <span className="annotation-edit-tooltip" role="tooltip">Edit annotation</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
};
