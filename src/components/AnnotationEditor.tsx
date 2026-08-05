import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Annotation,
  AnnotationKind,
  MeasureSpan,
} from '../types/document';
import { validateAnnotation } from '../music/documentSchema';
import {
  friendlyBeatFromRational,
  parseMeterBeatGrid,
  rationalPositionFromBeat,
} from '../music/meterPosition';

type AnnotationEditorMode = 'manual' | 'proposal' | 'accepted';

interface AnnotationEditorProps {
  mode: AnnotationEditorMode;
  initialAnnotation?: Annotation;
  defaultSpan: MeasureSpan;
  meter?: string;
  onSave(annotation: Annotation): void | Promise<void>;
  onCancel(): void;
  onDelete?(): void | Promise<void>;
}

const KIND_LABELS: Record<AnnotationKind, string> = {
  chord: 'Chord',
  modulation: 'Modulation',
  'voice-leading': 'Voice leading',
  explanation: 'Explanation',
};

const SUBDIVISION_LABELS = {
  1: 'On the beat',
  2: 'Halves',
  3: 'Thirds',
  4: 'Quarters',
} as const;

export const AnnotationEditor: React.FC<AnnotationEditorProps> = ({
  mode,
  initialAnnotation,
  defaultSpan,
  meter,
  onSave,
  onCancel,
  onDelete,
}) => {
  const grid = useMemo(() => parseMeterBeatGrid(meter), [meter]);
  const initialFriendlyPosition = initialAnnotation?.kind === 'chord'
    ? friendlyBeatFromRational(grid, initialAnnotation.position.offset)
    : { beat: 1, subdivision: 1 as const, step: 0 };
  const [kind, setKind] = useState<AnnotationKind>(initialAnnotation?.kind ?? 'explanation');
  const [startMeasure, setStartMeasure] = useState(
    initialAnnotation?.span.startMeasure ?? defaultSpan.startMeasure,
  );
  const [endMeasure, setEndMeasure] = useState(
    initialAnnotation?.span.endMeasure ?? defaultSpan.endMeasure,
  );
  const [label, setLabel] = useState(initialAnnotation?.label ?? '');
  const [body, setBody] = useState(initialAnnotation?.body ?? '');
  const [positionMeasure, setPositionMeasure] = useState(
    initialAnnotation?.kind === 'chord'
      ? initialAnnotation.position.measure
      : defaultSpan.startMeasure,
  );
  const [beat, setBeat] = useState(initialFriendlyPosition.beat);
  const [subdivision, setSubdivision] = useState<1 | 2 | 3 | 4>(
    initialFriendlyPosition.subdivision,
  );
  const [subdivisionStep, setSubdivisionStep] = useState(initialFriendlyPosition.step);
  const [chordSymbol, setChordSymbol] = useState(
    initialAnnotation?.kind === 'chord' ? initialAnnotation.chordSymbol : '',
  );
  const [romanNumeral, setRomanNumeral] = useState(
    initialAnnotation?.kind === 'chord' ? initialAnnotation.romanNumeral ?? '' : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const now = new Date().toISOString();
    const base = {
      id: initialAnnotation?.id ?? crypto.randomUUID(),
      kind,
      span: { startMeasure, endMeasure },
      label: label.trim(),
      body: body.trim(),
      source: initialAnnotation?.source ?? (mode === 'proposal' ? 'assistant' as const : 'user' as const),
      agentProfiles: initialAnnotation?.agentProfiles,
      createdAt: initialAnnotation?.createdAt ?? now,
      updatedAt: now,
    };
    let candidate: unknown = base;
    try {
      if (kind === 'chord') {
        candidate = {
          ...base,
          kind: 'chord',
          position: {
            measure: positionMeasure,
            offset: rationalPositionFromBeat(grid, {
              beat,
              subdivision,
              step: subdivisionStep,
            }),
          },
          chordSymbol: chordSymbol.trim(),
          ...(romanNumeral.trim() ? { romanNumeral: romanNumeral.trim() } : {}),
        };
      }
      const annotation = validateAnnotation(candidate);
      if (!annotation) throw new Error('Check the measure range and complete all required fields.');
      setSaving(true);
      setError(null);
      await onSave(annotation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Annotation could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="annotation-editor"
      aria-label={`${mode === 'manual' ? 'Create' : 'Edit'} annotation`}
      onSubmit={(event) => void handleSubmit(event)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="annotation-editor-grid">
        <label>
          Kind
          <select
            ref={firstFieldRef}
            value={kind}
            onChange={(event) => setKind(event.target.value as AnnotationKind)}
            disabled={saving}
          >
            {(Object.keys(KIND_LABELS) as AnnotationKind[]).map((value) => (
              <option key={value} value={value}>{KIND_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label>
          Start measure
          <input
            type="number"
            min="1"
            value={startMeasure}
            onChange={(event) => setStartMeasure(Number(event.target.value))}
            disabled={saving}
          />
        </label>
        <label>
          End measure
          <input
            type="number"
            min="1"
            value={endMeasure}
            onChange={(event) => setEndMeasure(Number(event.target.value))}
            disabled={saving}
          />
        </label>
      </div>

      {kind === 'chord' && (
        <fieldset className="annotation-position-fields">
          <legend>Chord position</legend>
          <label>
            Measure
            <input
              type="number"
              min={startMeasure || 1}
              max={endMeasure || undefined}
              value={positionMeasure}
              onChange={(event) => setPositionMeasure(Number(event.target.value))}
              disabled={saving}
            />
          </label>
          <label>
            Beat
            <select
              value={beat}
              onChange={(event) => setBeat(Number(event.target.value))}
              disabled={saving}
            >
              {Array.from({ length: grid.beats }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Subdivision
            <select
              value={subdivision}
              onChange={(event) => {
                const next = Number(event.target.value) as 1 | 2 | 3 | 4;
                setSubdivision(next);
                setSubdivisionStep(0);
              }}
              disabled={saving}
            >
              {(Object.keys(SUBDIVISION_LABELS) as unknown as Array<keyof typeof SUBDIVISION_LABELS>)
                .map((value) => (
                  <option key={value} value={value}>{SUBDIVISION_LABELS[value]}</option>
                ))}
            </select>
          </label>
          {subdivision > 1 && (
            <label>
              Subdivision step
              <select
                value={subdivisionStep}
                onChange={(event) => setSubdivisionStep(Number(event.target.value))}
                disabled={saving}
              >
                {Array.from({ length: subdivision }, (_, index) => (
                  <option key={index} value={index}>
                    {index === 0 ? 'On beat' : `${index + 1} of ${subdivision}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Chord symbol
            <input
              value={chordSymbol}
              onChange={(event) => setChordSymbol(event.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            Roman numeral (optional)
            <input
              value={romanNumeral}
              onChange={(event) => setRomanNumeral(event.target.value)}
              disabled={saving}
            />
          </label>
        </fieldset>
      )}

      <label>
        Label
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={saving}
        />
      </label>
      <label>
        Explanation
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={saving}
          rows={3}
        />
      </label>

      {error && <div className="annotation-editor-error" role="alert">{error}</div>}
      <div className="annotation-editor-actions">
        {onDelete && (
          <button type="button" className="annotation-delete" onClick={() => void onDelete()} disabled={saving}>
            Delete annotation
          </button>
        )}
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save annotation'}</button>
      </div>
    </form>
  );
};
