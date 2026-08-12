import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Annotation, AnnotationId, RangeAnnotation } from '../types/document';

interface AnnotationRailProps {
  annotations: readonly Annotation[];
  onSelect(annotation: RangeAnnotation, initiator: HTMLButtonElement): void;
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

export const AnnotationRail: React.FC<AnnotationRailProps> = ({ annotations, onSelect }) => {
  const rangeAnnotations = useMemo(() => sortRangeAnnotations(annotations), [annotations]);
  const [expandedId, setExpandedId] = useState<AnnotationId | null>(null);

  useEffect(() => {
    if (expandedId && !rangeAnnotations.some(({ id }) => id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, rangeAnnotations]);

  return (
    <aside className="annotation-rail" aria-labelledby="annotation-rail-title">
      <header className="annotation-rail-header">
        <div>
          <h4 id="annotation-rail-title">Annotations</h4>
          <p>Notes linked to passages in the score.</p>
        </div>
        <span className="annotation-rail-count" aria-label={`${rangeAnnotations.length} range annotations`}>
          {rangeAnnotations.length}
        </span>
      </header>

      {rangeAnnotations.length === 0 ? (
        <div className="annotation-rail-empty">
          <p>No range annotations yet.</p>
          <span>Select measures to add a modulation, voice-leading note, or explanation.</span>
        </div>
      ) : (
        <div className="annotation-rail-list">
          {rangeAnnotations.map((annotation) => {
            const expanded = expandedId === annotation.id;
            const bodyId = `annotation-body-${annotation.id}`;
            return (
              <article
                key={annotation.id}
                className={`annotation-rail-card annotation-${annotation.kind}`}
                data-annotation-kind={annotation.kind}
                data-selected={expanded ? 'true' : 'false'}
              >
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
                    <ChevronDown className="annotation-card-chevron" aria-hidden="true" />
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
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
};
