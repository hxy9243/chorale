import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, LoaderCircle } from "lucide-react";

import type { ScoreAnchor } from "../types/document";
import {
  analyzeRawAbcLines,
  applyAbcMeasureEdits,
  buildAbcPresentation,
  resolvePlaybackMeasure,
  transposeAbcMeasureText,
  validateAbcHeaderEdit,
  validateAbcMeasureEdit,
  type AbcHeaderLine,
  type AbcMeasureCell,
  type AbcTextRange,
  type PlaybackSourceRanges,
} from "../music/abcPresentation";
import { validateKeySignature } from "../utils/abcMetadata";
import {
  animateHorizontalScrollTo,
  calculateCenterScrollLeft,
  type SmoothScrollController,
} from "../utils/autoScroll";
import {
  type MeasureMutation,
  type MeasureMutationResult,
} from "../music/scoreDrafting";
import { MeasureDraftingToolbar } from "./MeasureDraftingToolbar";

interface AbcEditorProps {
  abcCode: string;
  onAbcChange: (newAbc: string, options?: { preserveSelection?: boolean }) => void;
  documentId?: string;
  revision?: number;
  activeAnchor?: ScoreAnchor | null;
  onSelectAnchor?: (anchor: ScoreAnchor | null) => void;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  onMeasureMutation?: (mutation: MeasureMutation) => MeasureMutationResult;
  playbackSourceRanges?: PlaybackSourceRanges | null;
  validationState?: "idle" | "building" | "valid" | "invalid";
  validationMessage?: string | null;
  visible?: boolean;
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

const findCell = (cells: readonly AbcMeasureCell[], cellId: string) =>
  cells.find(({ id }) => id === cellId);

const escapeSelector = (value: string) =>
  globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

const meterBeatCount = (meter: string | undefined) => {
  if (meter === "C") return 4;
  if (meter === "C|") return 2;
  const numerator = Number(meter?.match(/^(\d+)\s*\//)?.[1]);
  return Number.isInteger(numerator) && numerator > 0
    ? Math.min(numerator, 16)
    : 4;
};

const splitCellSourceByBeat = (
  cell: AbcMeasureCell,
  beatCount: number,
): string[] => {
  const duration = Math.max(cell.duration, Number.EPSILON);
  const boundaries = [0];
  for (let beat = 1; beat < beatCount; beat += 1) {
    const threshold = (duration * beat) / beatCount;
    const nextEvent = cell.events.find(
      (event) => event.start >= threshold - Number.EPSILON,
    );
    boundaries.push(
      nextEvent ? nextEvent.range.start - cell.range.start : cell.text.length,
    );
  }
  boundaries.push(cell.text.length);
  return boundaries
    .slice(0, -1)
    .map((start, index) =>
      cell.text.slice(start, Math.max(start, boundaries[index + 1])),
    );
};

const fractionFromText = (value: string | undefined, fallback: [number, number]) => {
  const match = value?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return fallback;
  return [Number(match[1]), Number(match[2])] as [number, number];
};

const defaultAbcNoteLength = (meter: string | undefined): [number, number] => {
  if (meter === "C" || meter === "C|") return [1, 8];
  const [numerator, denominator] = fractionFromText(meter, [4, 4]);
  return numerator * 4 < denominator * 3 ? [1, 16] : [1, 8];
};

const gcd = (left: number, right: number) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

const noteToken = (defaultLength: readonly [number, number], duration: readonly [number, number]) => {
  const numerator = duration[0] * defaultLength[1];
  const denominator = duration[1] * defaultLength[0];
  const divisor = gcd(numerator, denominator);
  const whole = numerator / divisor;
  const fraction = denominator / divisor;
  const suffix = whole === 1 && fraction === 1
    ? ""
    : fraction === 1 ? String(whole) : whole === 1 ? `/${fraction}` : `${whole}/${fraction}`;
  return `C${suffix}`;
};

export const AbcEditor: React.FC<AbcEditorProps> = ({
  abcCode,
  onAbcChange,
  documentId,
  revision = 0,
  activeAnchor = null,
  onSelectAnchor,
  onNavigateMeasure,
  onMeasureMutation,
  playbackSourceRanges = null,
  validationState = "idle",
  validationMessage,
  visible = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"measures" | "raw">("measures");
  const [horizontalScrollProgress, setHorizontalScrollProgress] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft | null>(null);
  const [toolbeltOpen, setToolbeltOpen] = useState(true);
  const [basicToolsOpen, setBasicToolsOpen] = useState(true);
  const [sheetInfoOpen, setSheetInfoOpen] = useState(false);
  const [transposeToolsOpen, setTransposeToolsOpen] = useState(false);
  const [structureToolsOpen, setStructureToolsOpen] = useState(true);
  const [keyDraft, setKeyDraft] = useState("C");
  const [measureToolErrors, setMeasureToolErrors] = useState<readonly string[]>([]);
  const selectionOriginRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  const committingRef = useRef(false);
  const editorCardRef = useRef<HTMLElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const measureTimelineRef = useRef<HTMLDivElement>(null);
  const horizontalScrollControllerRef = useRef<SmoothScrollController | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const measureInputRef = useRef<HTMLInputElement>(null);
  const draftSelectionRef = useRef({ start: 0, end: 0 });

  const handleTextareaScroll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = textarea.scrollTop;
      backdropRef.current.scrollLeft = textarea.scrollLeft;
    }
  };

  const presentationResult = useMemo(() => {
    try {
      return { presentation: buildAbcPresentation(abcCode), error: null };
    } catch (error) {
      return {
        presentation: null,
        error:
          error instanceof Error ? error.message : "ABC formatting failed.",
      };
    }
  }, [abcCode]);
  const presentation = presentationResult.presentation;
  const cells = useMemo(
    () =>
      presentation?.voices.flatMap(({ cells: voiceCells }) => voiceCells) || [],
    [presentation],
  );
  const expectedMeasureDomain = presentation
    ? Array.from({ length: presentation.measureCount }, (_, index) => index + 1)
    : [];
  const beatCount = meterBeatCount(
    presentation?.headers.find(({ tag }) => tag === "M")?.value,
  );
  const playingMeasure =
    presentation && playbackSourceRanges
      ? resolvePlaybackMeasure(
          presentation,
          playbackSourceRanges.starts,
          playbackSourceRanges.ends,
        )
    : null;
  const rawLinesAnalysis = useMemo(
    () =>
      analyzeRawAbcLines(abcCode, presentation, activeAnchor, playingMeasure),
    [abcCode, presentation, activeAnchor, playingMeasure],
  );
  const draftCellId = draft?.cellId;
  const draftValue = draft?.value;

  useEffect(() => {
    if (validationState === "invalid") setView("raw");
  }, [validationState]);

  useEffect(() => {
    if (!activeAnchor) {
      selectionOriginRef.current = null;
      return;
    }
    const origin = selectionOriginRef.current;
    if (
      origin === null ||
      origin < activeAnchor.startMeasure ||
      origin > activeAnchor.endMeasure
    ) {
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
        setDraft((current) =>
          current ? { ...current, baseRevision: revision } : null,
        );
      } else {
        setDraft(null);
      }
    }
  }, [documentId, draft, revision]);

  useEffect(() => {
    if (!draftCellId || draftValue === undefined || !presentation) return;
    const timeout = window.setTimeout(() => {
      const result = validateAbcMeasureEdit(
        presentation,
        draftCellId,
        draftValue,
      );
      setDraft((current) =>
        current?.cellId === draftCellId
        ? { ...current, error: result.ok ? null : result.error }
          : current,
      );
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [draftCellId, draftValue, presentation]);

  useEffect(() => {
    if (view !== "measures" || !activeAnchor?.startMeasure) return;
    const body = editorBodyRef.current;
    if (!body) return;
    const frame = window.requestAnimationFrame(() => {
      const target = body.querySelector<HTMLElement>(
        `[data-timeline-measure="${activeAnchor.startMeasure}"]`,
      );
      if (target) {
        const targetScrollLeft = calculateCenterScrollLeft(body, target);
        horizontalScrollControllerRef.current?.cancel();
        horizontalScrollControllerRef.current = animateHorizontalScrollTo(
          body,
          targetScrollLeft,
          200,
        );
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      horizontalScrollControllerRef.current?.cancel();
    };
  }, [activeAnchor?.startMeasure, view]);

  useEffect(() => {
    if (view !== "measures" || !playingMeasure) return;
    const body = editorBodyRef.current;
    if (!body) return;
    const frame = window.requestAnimationFrame(() => {
      const target = body.querySelector<HTMLElement>(
        `[data-timeline-measure="${playingMeasure}"]`,
      );
      if (target) {
        const targetScrollLeft = calculateCenterScrollLeft(body, target);
        horizontalScrollControllerRef.current?.cancel();
        horizontalScrollControllerRef.current = animateHorizontalScrollTo(
          body,
          targetScrollLeft,
          200,
        );
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      horizontalScrollControllerRef.current?.cancel();
    };
  }, [playingMeasure, view]);

  useEffect(() => {
    if (view !== "measures") return;
    const body = editorBodyRef.current;
    if (!body) return;
    const updateScrollProgress = () => {
      const maximum = Math.max(0, body.scrollWidth - body.clientWidth);
      setHorizontalScrollProgress(maximum > 0 ? body.scrollLeft / maximum : 0);
    };
    const handleWheel = (event: WheelEvent) => {
      const maximum = Math.max(0, body.scrollWidth - body.clientWidth);
      if (maximum <= 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
        return;
      body.scrollLeft = Math.max(
        0,
        Math.min(maximum, body.scrollLeft + event.deltaY),
      );
      updateScrollProgress();
      event.preventDefault();
    };
    updateScrollProgress();
    body.addEventListener("scroll", updateScrollProgress, { passive: true });
    body.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      body.removeEventListener("scroll", updateScrollProgress);
      body.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", updateScrollProgress);
    };
  }, [presentation, view]);

  useEffect(() => {
    if (view !== "raw") return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const syncScroll = () => {
      if (backdropRef.current && textarea) {
        backdropRef.current.scrollTop = textarea.scrollTop;
        backdropRef.current.scrollLeft = textarea.scrollLeft;
      }
    };
    syncScroll();
    window.addEventListener("resize", syncScroll);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(syncScroll);
      observer.observe(textarea);
    }
    return () => {
      window.removeEventListener("resize", syncScroll);
      observer?.disconnect();
    };
  }, [abcCode, view]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(abcCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const statusLabel =
    validationState === "building"
      ? "Rebuilding"
      : validationState === "valid"
        ? `Valid · r${revision}`
        : validationState === "invalid"
          ? "Invalid ABC"
          : "Waiting for source";

  const selectMeasure = (measure: number, shiftKey: boolean) => {
    const origin =
      shiftKey && selectionOriginRef.current !== null
        ? selectionOriginRef.current
        : measure;
    if (!shiftKey || selectionOriginRef.current === null)
      selectionOriginRef.current = measure;
    const startMeasure = Math.min(origin, measure);
    const endMeasure = Math.max(origin, measure);
    const anchor = {
      startMeasure,
      endMeasure,
      label:
        startMeasure === endMeasure
          ? `m. ${measure}`
          : `mm. ${startMeasure}–${endMeasure}`,
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
    const currentText = presentation.abc.slice(
      headerDraft.range.start,
      headerDraft.range.end,
    );
    if (headerDraft.value.trim() === currentText.trim() && !headerDraft.error) {
      setHeaderDraft(null);
      return true;
    }
    if (
      headerDraft.baseDocumentId !== documentId ||
      headerDraft.baseRevision !== revision
    ) {
      setHeaderDraft({
        ...headerDraft,
        error: "The source changed. Reopen this header before editing.",
      });
      return false;
    }
    const result = validateAbcHeaderEdit(
      presentation,
      headerDraft.range,
      headerDraft.value,
      headerDraft.tag,
    );
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
      const group = editorBodyRef.current?.querySelector<HTMLElement>(
        `[data-cell-text="${escapeSelector(cellId)}"]`,
      );
      (group?.querySelector<HTMLElement>("input") || group)?.focus();
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
        const sourceOrder = [...cells].sort(
          (a, b) => a.range.start - b.range.start,
        );
        const currentIndex = sourceOrder.findIndex(
          ({ id }) => id === draft.cellId,
        );
        const nextCell = navigateBy
          ? sourceOrder[currentIndex + navigateBy]
          : null;
        focusCell(nextCell?.id || draft.cellId);
      }
      return true;
    }
    if (
      draft.baseDocumentId !== documentId ||
      draft.baseRevision !== revision
    ) {
      setDraft({
        ...draft,
        error: "The source changed. Reopen this measure before editing.",
      });
      return false;
    }
    const result = validateAbcMeasureEdit(
      presentation,
      draft.cellId,
      draft.value,
    );
    if (!result.ok) {
      setDraft({ ...draft, error: result.error });
      return false;
    }
    const sourceOrder = [...cells].sort(
      (a, b) => a.range.start - b.range.start,
    );
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

  const restoreDraftSelection = (start: number, end = start) => {
    draftSelectionRef.current = { start, end };
    window.requestAnimationFrame(() => {
      const input = measureInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(start, end);
    });
  };

  const applyToolDraft = (nextValue: string, selectionStart: number, selectionEnd = selectionStart) => {
    if (!draft || !presentation) return;
    if (draft.baseDocumentId !== documentId || draft.baseRevision !== revision) {
      setDraft({ ...draft, error: "The source changed. Reopen this measure before editing." });
      return;
    }
    const result = validateAbcMeasureEdit(presentation, draft.cellId, nextValue);
    if (!result.ok) {
      setDraft({ ...draft, error: result.error });
      return;
    }
    const normalized = result.presentation.voices.flatMap(({ cells: voiceCells }) => voiceCells)
      .find(({ id }) => id === draft.cellId);
    if (!normalized) {
      setDraft({ ...draft, error: "The edited measure is no longer available." });
      return;
    }
    const boundedStart = Math.min(selectionStart, normalized.text.length);
    const boundedEnd = Math.min(selectionEnd, normalized.text.length);
    setDraft({ ...draft, value: normalized.text, error: null });
    restoreDraftSelection(boundedStart, boundedEnd);
  };

  const insertToolSource = (source: string, selectInsertedPitch = false) => {
    if (!draft) return;
    const { start, end } = draftSelectionRef.current;
    const next = `${draft.value.slice(0, start)}${source}${draft.value.slice(end)}`;
    const nextStart = selectInsertedPitch ? start : start + source.length;
    const nextEnd = selectInsertedPitch ? start + 1 : nextStart;
    applyToolDraft(next, nextStart, nextEnd);
  };

  const insertInlineKey = () => {
    const validation = validateKeySignature(keyDraft);
    if (!validation.valid || !validation.value) {
      if (draft) setDraft({ ...draft, error: validation.error || "Key signature is invalid." });
      return;
    }
    insertToolSource(`[K:${validation.value}]`);
  };

  const transposeFromToolbelt = (semitones: number) => {
    if (!presentation) return;
    if (draft && draftSelectionRef.current.start !== draftSelectionRef.current.end) {
      const { start, end } = draftSelectionRef.current;
      const selected = draft.value.slice(start, end);
      if (/\||\r|\n/.test(selected) || !/[A-Ga-gzZ]/.test(selected)) {
        setDraft({ ...draft, error: "Select complete ABC notes without a barline to transpose." });
        return;
      }
      try {
        const transposed = transposeAbcMeasureText(presentation, draft.cellId, selected, semitones);
        applyToolDraft(`${draft.value.slice(0, start)}${transposed}${draft.value.slice(end)}`, start, start + transposed.length);
      } catch (error) {
        setDraft({ ...draft, error: error instanceof Error ? error.message : "Could not transpose the selection." });
      }
      return;
    }
    if (!activeAnchor) {
      setMeasureToolErrors(["Select a measure range or text selection to transpose."]);
      return;
    }
    try {
      const edits = cells
        .filter((cell) => cell.editable && cell.measureNumber >= activeAnchor.startMeasure && cell.measureNumber <= activeAnchor.endMeasure)
        .map((cell) => ({
          cellId: cell.id,
          replacement: transposeAbcMeasureText(presentation, cell.id, cell.text, semitones),
        }));
      const result = applyAbcMeasureEdits(presentation, edits);
      if (!result.ok) {
        setMeasureToolErrors([result.error]);
        return;
      }
      committingRef.current = true;
      setDraft(null);
      onAbcChange(result.abc, { preserveSelection: true });
      committingRef.current = false;
      setMeasureToolErrors([]);
    } catch (error) {
      setMeasureToolErrors([error instanceof Error ? error.message : "Could not transpose the selected measures."]);
    }
  };

  const defaultNoteLength = fractionFromText(
    presentation?.headers.find(({ tag }) => tag === "L")?.value,
    defaultAbcNoteLength(presentation?.headers.find(({ tag }) => tag === "M")?.value),
  );
  const errorMessage = draft?.error
    || headerDraft?.error
    || measureToolErrors[0]
    || (validationState === "invalid" ? validationMessage : null);

  const headerFields = presentation && (
    <div className="abc-header-source" aria-label="ABC header fields">
      {presentation.headers.map((header) => {
        const isEditingHeader = headerDraft?.range.start === header.range.start;
        const fieldDescription = header.label
          ? `${header.label}: ${header.value}`
          : header.text;
        const fieldWidth = Math.min(
          42,
          Math.max(12, Math.max(header.text.length, fieldDescription.length) + 2),
        );
        return (
          <div
            className={`abc-header-line${isEditingHeader ? " is-editing" : ""}`}
            key={header.range.start}
            style={{ "--abc-header-field-width": `${fieldWidth}ch` } as React.CSSProperties}
          >
            {isEditingHeader ? (
              <input
                type="text"
                className="abc-header-edit-input"
                aria-label={`Edit header ${header.tag}`}
                value={headerDraft.value}
                autoFocus
                onChange={(event) =>
                  setHeaderDraft({ ...headerDraft, value: event.target.value, error: null })
                }
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={() => { composingRef.current = false; }}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) commitHeaderDraft();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setHeaderDraft(null);
                  } else if (event.key === "Enter" && !composingRef.current) {
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
  );

  const scrollTimeline = (progress: number) => {
    const body = editorBodyRef.current;
    if (!body) return;
    const maximum = Math.max(0, body.scrollWidth - body.clientWidth);
    body.scrollLeft = maximum * progress;
    setHorizontalScrollProgress(progress);
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
        className={`abc-timeline-voice${playingMeasure === cell.measureNumber ? " is-playing" : ""}${editing && draft.error ? " is-invalid" : ""}${editing ? " is-editing" : ""}`}
        data-voice={cell.voiceId}
        data-measure={cell.measureNumber}
        data-color={colorIndex % 6}
        key={cell.id}
      >
        <span className="abc-timeline-voice-label">{voiceLabel}</span>
        <div
          className={`abc-source-container${editing ? " is-editing" : ""}`}
          data-cell-text={cell.id}
          onClick={(event) => {
            selectMeasure(cell.measureNumber, event.shiftKey);
            if (!editing && cell.editable) beginEdit(cell);
          }}
          tabIndex={!editing && cell.editable ? 0 : undefined}
          role={!editing && cell.editable ? "button" : undefined}
          aria-label={
            !editing && cell.editable
              ? `Edit ${cell.voiceId}, measure ${cell.measureNumber}`
              : undefined
          }
          onKeyDown={(event) => {
            if (
              !editing &&
              cell.editable &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              beginEdit(cell);
            }
          }}
        >
          {editing ? (
            <input
              ref={measureInputRef}
              type="text"
              className="abc-measure-edit-input"
              aria-label={`Edit ${cell.voiceId}, measure ${cell.measureNumber}`}
              value={draft.value}
              autoFocus
              readOnly={!cell.editable}
              onChange={(event) => updateDraft(cell, event.target.value)}
              onSelect={(event) => {
                draftSelectionRef.current = {
                  start: event.currentTarget.selectionStart || 0,
                  end: event.currentTarget.selectionEnd || 0,
                };
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  commitDraft(0, false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft(null);
                  focusCell(cell.id);
                } else if (event.key === "Enter" && !composingRef.current) {
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
    <section
      ref={editorCardRef}
      className={`abc-editor-card glass-panel ${visible ? "" : "is-collapsed"}`}
      aria-label="ABC editor pane"
    >
      <div className="abc-editor-chrome">
        <div className="editor-header">
          <div
            className="abc-editor-tabs"
            role="tablist"
            aria-label="ABC editor view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "measures"}
              disabled={!presentation || validationState === "invalid"}
              onClick={() => setView("measures")}
            >
              Measure Source
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "raw"}
              onClick={() => setView("raw")}
            >
              Raw Source
            </button>
          </div>
          <div className="editor-actions">
            <span className={`editor-status-pill ${validationState}`}>
              {validationState === "building" && (
                <LoaderCircle size={13} className="spin" />
              )}
              {validationState === "valid" && <Check size={13} />}
              {validationState === "invalid" && <AlertTriangle size={13} />}
              {statusLabel}
            </span>
            <button
              className="btn btn-sm btn-ghost editor-copy-btn"
              onClick={handleCopy}
              title="Copy ABC notation to clipboard"
              type="button"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      </div>

      {visible && view === "measures" && presentation && (
        <section className={`abc-toolbelt${toolbeltOpen ? " is-open" : ""}`} aria-label="Measure Source tool belt">
          <button
            type="button"
            className="abc-toolbelt-toggle"
            aria-expanded={toolbeltOpen}
            aria-controls="abc-measure-toolbelt-sections"
            onClick={() => setToolbeltOpen((open) => !open)}
          >
            Tool belt
          </button>
          {toolbeltOpen && (
            <div className="abc-toolbelt-sections" id="abc-measure-toolbelt-sections">
              <section className="abc-toolbelt-section">
                <button type="button" className="abc-toolbelt-section-toggle" aria-expanded={basicToolsOpen} onClick={() => setBasicToolsOpen((open) => !open)}>Basics</button>
                {basicToolsOpen && (
                  <div className="abc-toolbelt-actions" role="group" aria-label="Basic ABC notation">
                    {([
                      ["Quarter", "♩", [1, 4]],
                      ["Eighth", "♪", [1, 8]],
                      ["16th", "♫", [1, 16]],
                      ["32nd", "♬", [1, 32]],
                    ] as const).map(([label, icon, duration]) => {
                      const source = noteToken(defaultNoteLength, duration);
                      return <button key={label} type="button" aria-label={`${label} note`} title={source} disabled={!draft} onMouseDown={(event) => event.preventDefault()} onClick={() => insertToolSource(source, true)}><span aria-hidden="true" className="abc-toolbelt-note-icon">{icon}</span></button>;
                    })}
                    {["^", "_", "="].map((source) => <button key={source} type="button" title={source} disabled={!draft} onMouseDown={(event) => event.preventDefault()} onClick={() => insertToolSource(source)}>{source}</button>)}
                    <button type="button" title="(3C C C" disabled={!draft} onMouseDown={(event) => event.preventDefault()} onClick={() => insertToolSource("(3C C C")}>Triplet</button>
                    <label className="abc-toolbelt-key">Key <input aria-label="Inline key" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} /></label>
                    <button type="button" title={`[K:${keyDraft.trim()}]`} disabled={!draft} onMouseDown={(event) => event.preventDefault()} onClick={insertInlineKey}>Insert key</button>
                  </div>
                )}
              </section>
              <section className="abc-toolbelt-section abc-toolbelt-sheet-info">
                <button type="button" className="abc-toolbelt-section-toggle" aria-expanded={sheetInfoOpen} onClick={() => setSheetInfoOpen((open) => !open)}>Sheet info</button>
                {sheetInfoOpen && headerFields}
              </section>
              <section className="abc-toolbelt-section">
                <button type="button" className="abc-toolbelt-section-toggle" aria-expanded={transposeToolsOpen} onClick={() => setTransposeToolsOpen((open) => !open)}>Transpose</button>
                {transposeToolsOpen && (
                  <div className="abc-toolbelt-actions" role="group" aria-label="Transpose ABC source">
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => transposeFromToolbelt(-1)}>−1 semitone</button>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => transposeFromToolbelt(1)}>+1 semitone</button>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => transposeFromToolbelt(-12)}>−1 octave</button>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => transposeFromToolbelt(12)}>+1 octave</button>
                  </div>
                )}
              </section>
              {onMeasureMutation && (
                <section className="abc-toolbelt-section">
                  <button type="button" className="abc-toolbelt-section-toggle" aria-expanded={structureToolsOpen} onClick={() => setStructureToolsOpen((open) => !open)}>Measure structure</button>
                  {structureToolsOpen && (activeAnchor ? (
                    <MeasureDraftingToolbar span={activeAnchor} onMutate={onMeasureMutation} onError={setMeasureToolErrors} />
                  ) : (
                    <div className="measure-drafting-toolbar abc-toolbelt-actions is-unavailable" role="group" aria-label="Measure structure unavailable" aria-disabled="true">
                      <span className="measure-drafting-toolbar-label">Select a measure</span>
                      <button type="button" disabled>Add before</button>
                      <button type="button" disabled>Add after</button>
                      <button type="button" className="danger" disabled>Delete</button>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </section>
      )}

      {visible && (
        <div
          className={`editor-body${view === "raw" ? " is-raw-view" : " is-measure-view"}`}
          ref={editorBodyRef}
        >
          {view === "raw" ? (
            <div className="abc-raw-editor">
              <div
                className="abc-raw-backdrop"
                ref={backdropRef}
                aria-hidden="true"
              >
                {rawLinesAnalysis.map((line) => (
                  <div
                    key={line.lineNumber}
                    className={`abc-raw-line-row${line.voice ? " has-voice" : ""}${line.isSelected ? " is-selected" : ""}${line.isPlaying ? " is-playing" : ""}`}
                    data-voice={line.voice?.id}
                    data-color={
                      line.voice ? line.voice.colorIndex % 6 : undefined
                    }
                    data-measure={line.measureNumbers.join(",")}
                  >
                    <span className="abc-raw-line-number">
                      {line.lineNumber}
                    </span>
                    <span className="abc-raw-ghost-text">
                      {line.segments.length > 0 &&
                      line.segments.some((seg) => seg.text.length > 0)
                        ? line.segments.map((seg, sIdx) => (
                          <span
                            key={sIdx}
                              className={`abc-raw-segment${seg.measureNumber ? " abc-raw-measure-seg" : ""}${seg.isSelected ? " is-selected" : ""}${seg.isPlaying ? " is-playing" : ""}`}
                            data-measure={seg.measureNumber}
                          >
                            {seg.text}
                          </span>
                        ))
                        : "\u00A0"}
                    </span>
                    {line.explanation && (
                      <span
                        className="abc-raw-explanation"
                        title={line.explanation}
                      >
                        {line.explanation}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                className="abc-textarea"
                value={abcCode}
                onChange={(event) => onAbcChange(event.target.value)}
                onScroll={handleTextareaScroll}
                placeholder="Parsed ABC code will appear here. Edit code directly to rebuild score output."
                rows={Math.max(rawLinesAnalysis.length, 16)}
                spellCheck={false}
              />
            </div>
          ) : !presentation ? (
            <div className="abc-formatting-status" role="status">
              {presentationResult.error}
            </div>
          ) : (
            <>
              <div className="abc-measure-view">
                {presentation.warnings.map((warning) => (
                  <div className="abc-raw-warning" key={warning}>
                    {warning}
                  </div>
                ))}
                <div
                  ref={measureTimelineRef}
                  className="abc-measure-timeline"
                  aria-label="ABC measures by voice"
                >
                {expectedMeasureDomain.map((measure) => {
                    const measureCells = presentation.voices.flatMap(
                      (voice) => {
                        const cell = findCell(
                          voice.cells,
                          `${voice.id}:${measure}`,
                        );
                    return cell ? [{ cell, voice }] : [];
                      },
                    );
                    const selected = Boolean(
                      activeAnchor &&
                      measure >= activeAnchor.startMeasure &&
                      measure <= activeAnchor.endMeasure,
                    );
                  return (
                    <section
                        className={`abc-timeline-measure${selected ? " is-selected" : ""}${playingMeasure === measure ? " is-playing" : ""}`}
                      data-timeline-measure={measure}
                      key={measure}
                    >
                      <button
                        type="button"
                        className="abc-timeline-measure-number"
                        aria-label={`Select measure ${measure}`}
                        aria-pressed={selected}
                          onClick={(event) =>
                            selectMeasure(measure, event.shiftKey)
                          }
                      >
                        Measure {measure}
                      </button>
                      <div className="abc-timeline-voice-stack">
                          {measureCells.map(({ cell, voice }) =>
                            renderTimelineCell(
                              cell,
                              voice.colorIndex,
                              voice.label,
                            ),
                          )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
            </>
          )}
        </div>
      )}
      {visible && view === "measures" && presentation && (
        <div className="abc-horizontal-scrollbar">
          <input
            type="range"
            aria-label="Scroll ABC source horizontally"
            min="0"
            max="1000"
            value={Math.round(horizontalScrollProgress * 1000)}
            onChange={(event) => scrollTimeline(Number(event.target.value) / 1000)}
          />
        </div>
      )}
      <div className={`abc-editor-error-well${errorMessage ? " has-error" : ""}`} role={errorMessage ? "alert" : "status"} aria-live="polite">
        {errorMessage || "\u00A0"}
      </div>
    </section>
  );
};
