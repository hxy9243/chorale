import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, FileCode2, LoaderCircle, X } from 'lucide-react';

import type { ScoreAnchor } from '../types/document';
import {
  analyzeRawAbcLines,
  buildAbcPresentation,
  resolvePlaybackMeasure,
  validateAbcHeaderEdit,
  validateAbcMeasureEdit,
  type AbcHeaderLine,
  type AbcMeasureCell,
  type AbcTextRange,
  type PlaybackSourceRanges,
} from '../music/abcPresentation';

interface AbcEditorProps {
  abcCode: string;
  onAbcChange: (newAbc: string) => void;
  documentId?: string;
  revision?: number;
  activeAnchor?: ScoreAnchor | null;
  onSelectAnchor?: (anchor: ScoreAnchor | null) => void;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  playbackSourceRanges?: PlaybackSourceRanges | null;
  validationState?: 'idle' | 'building' | 'valid' | 'invalid';
  validationMessage?: string | null;
  visible?: boolean;
  onToggleVisibility?: () => void;
}

type Draft = {
  cellId: string;
  value: string;
  baseDocumentId?: string;
  baseRevision: number;
  error: string | null;
};

type HeaderDraft = {
  range: AbcTextRange;
  tag: string;
  value: string;
  baseDocumentId?: string;
  baseRevision: number;
  error: string | null;
};

const findCell = (cells: readonly AbcMeasureCell[], cellId: string) => (
  cells.find(({ id }) => id === cellId)
);

const escapeSelector = (value: string) => (
  globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
);

const meterBeatCount = (meter: string | undefined) => {
  if (meter === 'C') return 4;
  if (meter === 'C|') return 2;
  const numerator = Number(meter?.match(/^(\d+)\s*\//)?.[1]);
  return Number.isInteger(numerator) && numerator > 0 ? Math.min(numerator, 16) : 4;
};

const splitCellSourceByBeat = (cell: AbcMeasureCell, beatCount: number): string[] => {
  const duration = Math.max(cell.duration, Number.EPSILON);
  const boundaries = [0];
  for (let beat = 1; beat < beatCount; beat += 1) {
    const threshold = duration * beat / beatCount;
    const nextEvent = cell.events.find((event) => event.start >= threshold - Number.EPSILON);
    boundaries.push(nextEvent ? nextEvent.range.start - cell.range.start : cell.text.length);
  }
  boundaries.push(cell.text.length);
  return boundaries.slice(0, -1).map((start, index) => (
    cell.text.slice(start, Math.max(start, boundaries[index + 1]))
  ));
};

export const AbcEditor: React.FC<AbcEditorProps> = ({
  abcCode,
  onAbcChange,
  documentId,
  revision = 0,
  activeAnchor = null,
  onSelectAnchor,
  onNavigateMeasure,
  playbackSourceRanges = null,
  validationState = 'idle',
  validationMessage,
  visible = true,
  onToggleVisibility = () => undefined,
}) => {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'measures' | 'raw'>('measures');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft | null>(null);
  const selectionOriginRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  const committingRef = useRef(false);
  const editorBodyRef = useRef<HTMLDivElement>(null);

  const presentationResult = useMemo(() => {
    try {
      return { presentation: buildAbcPresentation(abcCode), error: null };
    } catch (error) {
      return { presentation: null, error: error instanceof Error ? error.message : 'ABC formatting failed.' };
    }
  }, [abcCode]);
  const presentation = presentationResult.presentation;
  const cells = useMemo(() => presentation?.voices.flatMap(({ cells: voiceCells }) => voiceCells) || [], [presentation]);
  const expectedMeasureDomain = presentation
    ? Array.from({ length: presentation.measureCount }, (_, index) => index + 1)
    : [];
  const beatCount = meterBeatCount(presentation?.headers.find(({ tag }) => tag === 'M')?.value);
  const playingMeasure = presentation && playbackSourceRanges
    ? resolvePlaybackMeasure(presentation, playbackSourceRanges.starts, playbackSourceRanges.ends)
    : null;
  const rawLinesAnalysis = useMemo(() => (
    analyzeRawAbcLines(abcCode, presentation, activeAnchor, playingMeasure)
  ), [abcCode, presentation, activeAnchor, playingMeasure]);
  const draftCellId = draft?.cellId;
  const draftValue = draft?.value;

  useEffect(() => {
    if (validationState === 'invalid') setView('raw');
  }, [validationState]);

  useEffect(() => {
    if (!activeAnchor) {
      selectionOriginRef.current = null;
      return;
    }
    const origin = selectionOriginRef.current;
    if (origin === null || origin < activeAnchor.startMeasure || origin > activeAnchor.endMeasure) {
      selectionOriginRef.current = activeAnchor.startMeasure;
    }
  }, [activeAnchor]);

  useEffect(() => {
    if (!draft) return;
    if (draft.baseDocumentId !== documentId) {
      setDraft(null);
      return;
    }
    if (draft.baseRevision !== revision) {
      if (committingRef.current) {
        setDraft((current) => (current ? { ...current, baseRevision: revision } : null));
      } else {
        setDraft(null);
      }
    }
  }, [documentId, draft, revision]);

  useEffect(() => {
    if (!draftCellId || draftValue === undefined || !presentation) return;
    const timeout = window.setTimeout(() => {
      const result = validateAbcMeasureEdit(presentation, draftCellId, draftValue);
      setDraft((current) => current?.cellId === draftCellId
        ? { ...current, error: result.ok ? null : result.error }
        : current);
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [draftCellId, draftValue, presentation]);

  useEffect(() => {
    if (view !== 'measures' || !activeAnchor?.startMeasure) return;
    const frame = window.requestAnimationFrame(() => {
      const target = editorBodyRef.current?.querySelector<HTMLElement>(
        `[data-timeline-measure="${activeAnchor.startMeasure}"]`,
      );
      target?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeAnchor?.startMeasure, view]);

  useEffect(() => {
    if (view !== 'measures' || !playingMeasure) return;
    const frame = window.requestAnimationFrame(() => {
      const target = editorBodyRef.current?.querySelector<HTMLElement>(
        `[data-timeline-measure="${playingMeasure}"]`,
      );
      target?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [playingMeasure, view]);

  useEffect(() => {
    if (view !== 'measures') return;
    const body = editorBodyRef.current;
    if (!body) return;
    const updateProgress = () => {
      const maximum = Math.max(0, body.scrollWidth - body.clientWidth);
      setScrollProgress(maximum > 0 ? body.scrollLeft / maximum : 0);
    };
    updateProgress();
    body.addEventListener('scroll', updateProgress, { passive: true });
    const handleWheel = (event: WheelEvent) => {
      const maximum = Math.max(0, body.scrollWidth - body.clientWidth);
      if (maximum <= 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      body.scrollLeft = Math.max(0, Math.min(maximum, body.scrollLeft + event.deltaY));
      updateProgress();
      event.preventDefault();
    };
    body.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', updateProgress);
    return () => {
      body.removeEventListener('scroll', updateProgress);
      body.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', updateProgress);
    };
  }, [presentation, view]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(abcCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const statusLabel = validationState === 'building' ? 'Rebuilding'
    : validationState === 'valid' ? `Valid · r${revision}`
      : validationState === 'invalid' ? 'Invalid ABC'
        : 'Waiting for source';

  const selectMeasure = (measure: number, shiftKey: boolean) => {
    const origin = shiftKey && selectionOriginRef.current !== null ? selectionOriginRef.current : measure;
    if (!shiftKey || selectionOriginRef.current === null) selectionOriginRef.current = measure;
    const startMeasure = Math.min(origin, measure);
    const endMeasure = Math.max(origin, measure);
    const anchor = {
      startMeasure,
      endMeasure,
      label: startMeasure === endMeasure ? `m. ${measure}` : `mm. ${startMeasure}–${endMeasure}`,
    };
    if (onNavigateMeasure) onNavigateMeasure(anchor);
    else onSelectAnchor?.(anchor);
  };

  const beginEdit = (cell: AbcMeasureCell) => {
    if (!cell.editable) return;
    if (draft?.cellId === cell.id) return;
    setDraft({
      cellId: cell.id,
      value: cell.text,
      baseDocumentId: documentId,
      baseRevision: revision,
      error: null,
    });
  };

  const beginHeaderEdit = (header: AbcHeaderLine) => {
    setHeaderDraft({
      range: header.range,
      tag: header.tag,
      value: header.text,
      baseDocumentId: documentId,
      baseRevision: revision,
      error: null,
    });
  };

  const commitHeaderDraft = (): boolean => {
    if (committingRef.current) return true;
    if (!headerDraft || !presentation) return false;
    const currentText = presentation.abc.slice(headerDraft.range.start, headerDraft.range.end);
    if (headerDraft.value.trim() === currentText.trim() && !headerDraft.error) {
      setHeaderDraft(null);
      return true;
    }
    if (headerDraft.baseDocumentId !== documentId || headerDraft.baseRevision !== revision) {
      setHeaderDraft({ ...headerDraft, error: 'The source changed. Reopen this header before editing.' });
      return false;
    }
    const result = validateAbcHeaderEdit(presentation, headerDraft.range, headerDraft.value, headerDraft.tag);
    if (!result.ok) {
      setHeaderDraft({ ...headerDraft, error: result.error });
      return false;
    }
    committingRef.current = true;
    try {
      setHeaderDraft(null);
      onAbcChange(result.abc);
    } finally {
      committingRef.current = false;
    }
    return true;
  };

  const updateDraft = (cell: AbcMeasureCell, value: string) => {
    setDraft({
      cellId: cell.id,
      value,
      baseDocumentId: documentId,
      baseRevision: revision,
      error: null,
    });
  };

  const focusCell = (cellId: string) => {
    window.requestAnimationFrame(() => {
      const group = editorBodyRef.current?.querySelector<HTMLElement>(`[data-cell-text="${escapeSelector(cellId)}"]`);
      (group?.querySelector<HTMLElement>('input') || group)?.focus();
    });
  };

  const commitDraft = (navigateBy = 0, refocus = false): boolean => {
    if (committingRef.current) return true;
    if (!draft || !presentation) return false;
    const target = cells.find(({ id }) => id === draft.cellId);
    if (!target) {
      setDraft(null);
      return false;
    }
    if (draft.value === target.text && !draft.error) {
      setDraft(null);
      if (refocus || navigateBy !== 0) {
        const sourceOrder = [...cells].sort((a, b) => a.range.start - b.range.start);
        const currentIndex = sourceOrder.findIndex(({ id }) => id === draft.cellId);
        const nextCell = navigateBy ? sourceOrder[currentIndex + navigateBy] : null;
        focusCell(nextCell?.id || draft.cellId);
      }
      return true;
    }
    if (draft.baseDocumentId !== documentId || draft.baseRevision !== revision) {
      setDraft({ ...draft, error: 'The source changed. Reopen this measure before editing.' });
      return false;
    }
    const result = validateAbcMeasureEdit(presentation, draft.cellId, draft.value);
    if (!result.ok) {
      setDraft({ ...draft, error: result.error });
      return false;
    }
    const sourceOrder = [...cells].sort((a, b) => a.range.start - b.range.start);
    const currentIndex = sourceOrder.findIndex(({ id }) => id === draft.cellId);
    const nextCell = navigateBy ? sourceOrder[currentIndex + navigateBy] : null;
    const committedCellId = draft.cellId;
    committingRef.current = true;
    try {
      setDraft(null);
      onAbcChange(result.abc);
      if (refocus || navigateBy !== 0) {
        focusCell(nextCell?.id || committedCellId);
      }
    } finally {
      committingRef.current = false;
    }
    return true;
  };

  const navigateTimeline = (progress: number) => {
    const body = editorBodyRef.current;
    if (!body) return;
    const maximum = Math.max(0, body.scrollWidth - body.clientWidth);
    body.scrollLeft = maximum * progress;
    setScrollProgress(progress);
  };

  const renderTimelineCell = (
    cell: AbcMeasureCell,
    colorIndex: number,
    voiceLabel: string,
  ) => {
    const editing = draft?.cellId === cell.id;
    const beatValues = splitCellSourceByBeat(cell, beatCount);
    return (
      <div
        className={`abc-timeline-voice${playingMeasure === cell.measureNumber ? ' is-playing' : ''}${editing && draft.error ? ' is-invalid' : ''}${editing ? ' is-editing' : ''}`}
        data-voice={cell.voiceId}
        data-measure={cell.measureNumber}
        data-color={colorIndex % 6}
        key={cell.id}
      >
        <span className="abc-timeline-voice-label">{voiceLabel}</span>
        <div
          className={`abc-source-container${editing ? ' is-editing' : ''}`}
          data-cell-text={cell.id}
          onClick={(event) => {
            selectMeasure(cell.measureNumber, event.shiftKey);
            if (!editing && cell.editable) beginEdit(cell);
          }}
          tabIndex={!editing && cell.editable ? 0 : undefined}
          role={!editing && cell.editable ? 'button' : undefined}
          aria-label={!editing && cell.editable ? `Edit ${cell.voiceId}, measure ${cell.measureNumber}` : undefined}
          onKeyDown={(event) => {
            if (!editing && cell.editable && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              beginEdit(cell);
            }
          }}
        >
          {editing ? (
            <input
              type="text"
              className="abc-measure-edit-input"
              aria-label={`Edit ${cell.voiceId}, measure ${cell.measureNumber}`}
              value={draft.value}
              autoFocus
              readOnly={!cell.editable}
              onChange={(event) => updateDraft(cell, event.target.value)}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  commitDraft(0, false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraft(null);
                  focusCell(cell.id);
                } else if (event.key === 'Enter' && !composingRef.current) {
                  event.preventDefault();
                  commitDraft(0, true);
                }
              }}
            />
          ) : (
            <div className="abc-source-beats">
              {beatValues.map((value, beatIndex) => (
                <span
                  key={beatIndex}
                  className="abc-source-beat-display"
                  data-beat={beatIndex + 1}
                >
                  {value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className={`abc-editor-card glass-panel ${visible ? '' : 'is-collapsed'}`} aria-label="ABC editor pane">
      <div className="abc-editor-chrome">
        <div className="editor-header">
          <div className="editor-title-group">
            <FileCode2 className="w-4 h-4" />
            <div>
              <h3>ABC code</h3>
              <p>Revision-aware source for score rendering and playback.</p>
            </div>
          </div>
          <div className="editor-actions">
            <span className={`editor-status-pill ${validationState}`}>
              {validationState === 'building' && <LoaderCircle size={14} className="spin" />}
              {validationState === 'valid' && <Check size={14} />}
              {validationState === 'invalid' && <AlertTriangle size={14} />}
              {statusLabel}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={handleCopy} title="Copy ABC notation to clipboard" type="button">
              <Copy className="w-3.5 h-3.5" />{copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn btn-sm btn-secondary editor-close-button" type="button" onClick={onToggleVisibility} title="Close ABC editor" aria-label="Close ABC editor">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="abc-editor-toolbar" aria-label="ABC editor views and voices">
          <div className="abc-editor-tabs" role="tablist" aria-label="ABC editor view">
            <button type="button" role="tab" aria-selected={view === 'measures'} disabled={!presentation || validationState === 'invalid'} onClick={() => setView('measures')}>Measure Source</button>
            <button type="button" role="tab" aria-selected={view === 'raw'} onClick={() => setView('raw')}>Raw Source</button>
          </div>
        </div>
        {validationMessage && <div className={`editor-banner ${validationState === 'invalid' ? 'error' : 'info'}`} role="status">{validationMessage}</div>}
        {draft?.error && (
          <div className="editor-banner error abc-draft-error" role="alert">
            <span>{draft.error}</span>
            <button type="button" onClick={() => focusCell(draft.cellId)}>Return to measure</button>
          </div>
        )}
        {headerDraft?.error && (
          <div className="editor-banner error abc-draft-error" role="alert">
            <span>{headerDraft.error}</span>
          </div>
        )}
      </div>

      {visible && (
        <div className={`editor-body${view === 'raw' ? ' is-raw-view' : ''}`} ref={editorBodyRef}>
          {view === 'raw' ? (
            <div className="abc-raw-editor">
              <div className="editor-line-numbers" aria-hidden="true">
                {rawLinesAnalysis.map((line) => <span key={line.lineNumber}>{line.lineNumber}</span>)}
              </div>
              <div className="abc-raw-content">
                <div className="abc-raw-backdrop" aria-hidden="true">
                  {rawLinesAnalysis.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`abc-raw-line-row${line.voice ? ' has-voice' : ''}${line.isSelected ? ' is-selected' : ''}${line.isPlaying ? ' is-playing' : ''}`}
                      data-voice={line.voice?.id}
                      data-color={line.voice ? line.voice.colorIndex % 6 : undefined}
                      data-measure={line.measureNumbers.join(',')}
                    >
                      <span className="abc-raw-ghost-text">
                        {line.segments.map((seg, sIdx) => (
                          <span
                            key={sIdx}
                            className={`abc-raw-segment${seg.measureNumber ? ' abc-raw-measure-seg' : ''}${seg.isSelected ? ' is-selected' : ''}${seg.isPlaying ? ' is-playing' : ''}`}
                            data-measure={seg.measureNumber}
                          >
                            {seg.text}
                          </span>
                        ))}
                      </span>
                      {line.explanation && (
                        <span className="abc-raw-explanation" title={line.explanation}>
                          {line.explanation}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <textarea
                  className="abc-textarea"
                  value={abcCode}
                  onChange={(event) => onAbcChange(event.target.value)}
                  placeholder="Parsed ABC code will appear here. Edit code directly to rebuild score output."
                  rows={Math.max(rawLinesAnalysis.length, 16)}
                  spellCheck={false}
                />
              </div>
            </div>
          ) : !presentation ? (
            <div className="abc-formatting-status" role="status">{presentationResult.error}</div>
          ) : (
            <div className="abc-measure-view">
              <div className="abc-header-source" aria-label="ABC header fields">
                {presentation.headers.map((header) => {
                  const isEditingHeader = headerDraft?.range.start === header.range.start;
                  return (
                    <div
                      className={`abc-header-line${isEditingHeader ? ' is-editing' : ''}`}
                      key={header.range.start}
                    >
                      {isEditingHeader ? (
                        <input
                          type="text"
                          className="abc-header-edit-input"
                          aria-label={`Edit header ${header.tag}`}
                          value={headerDraft.value}
                          autoFocus
                          onChange={(event) => setHeaderDraft({ ...headerDraft, value: event.target.value, error: null })}
                          onCompositionStart={() => { composingRef.current = true; }}
                          onCompositionEnd={() => { composingRef.current = false; }}
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              commitHeaderDraft();
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setHeaderDraft(null);
                            } else if (event.key === 'Enter' && !composingRef.current) {
                              event.preventDefault();
                              commitHeaderDraft();
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="abc-header-line-button"
                          aria-label={`Edit ${header.label || header.tag}: ${header.text}`}
                          onClick={() => beginHeaderEdit(header)}
                        >
                          <code>{header.text}</code>
                          {header.label && <span>{header.label}: {header.value}</span>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {presentation.warnings.map((warning) => <div className="abc-raw-warning" key={warning}>{warning}</div>)}
              <div className="abc-measure-timeline" aria-label="ABC measures by voice">
                {expectedMeasureDomain.map((measure) => {
                  const measureCells = presentation.voices.flatMap((voice) => {
                    const cell = findCell(voice.cells, `${voice.id}:${measure}`);
                    return cell ? [{ cell, voice }] : [];
                  });
                  const maxMeasureChars = Math.max(
                    ...measureCells.map(({ cell }) => (draft?.cellId === cell.id ? draft.value.length : cell.text.length)),
                    14,
                  );
                  const selected = Boolean(activeAnchor
                    && measure >= activeAnchor.startMeasure
                    && measure <= activeAnchor.endMeasure);
                  return (
                    <section
                      className={`abc-timeline-measure${selected ? ' is-selected' : ''}${playingMeasure === measure ? ' is-playing' : ''}`}
                      data-timeline-measure={measure}
                      style={{ minWidth: `max(18rem, calc(${maxMeasureChars + 8}ch + 5.5rem))` }}
                      key={measure}
                    >
                      <button
                        type="button"
                        className="abc-timeline-measure-number"
                        aria-label={`Select measure ${measure}`}
                        aria-pressed={selected}
                        onClick={(event) => selectMeasure(measure, event.shiftKey)}
                      >
                        Measure {measure}
                      </button>
                      <div className="abc-timeline-voice-stack">
                        {measureCells.map(({ cell, voice }) => (
                          renderTimelineCell(cell, voice.colorIndex, voice.label)
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {visible && view === 'measures' && presentation && (
        <div className="abc-measure-navigator">
          <span>Measure 1</span>
          <input
            type="range"
            aria-label="Navigate measures"
            min="0"
            max="1000"
            value={Math.round(scrollProgress * 1000)}
            onChange={(event) => navigateTimeline(Number(event.target.value) / 1000)}
          />
          <span>Measure {presentation.measureCount}</span>
        </div>
      )}
    </section>
  );
};
