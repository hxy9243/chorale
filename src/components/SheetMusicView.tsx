import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { ZoomIn, ZoomOut, RotateCcw, SlidersHorizontal, Tag, X } from 'lucide-react';
import type {
  Annotation,
  AnnotationId,
  RangeAnnotation,
  ScoreAnchor,
} from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';
import {
  configureAudioPlayback,
  hideSyntheticTupletRests,
  prepareAbcForPlayback,
} from '../utils/abcAudio';
import {
  buildMeasureOccurrences,
  selectMeasureWithRepeats,
  type MeasureOccurrence,
  type PlaybackPosition,
} from '../utils/repeatPlayback';
import {
  calculateCenterScrollTop,
  animateScrollTo,
  type SmoothScrollController,
} from '../utils/autoScroll';
import { AnnotationEditor } from './AnnotationEditor';
import { AnnotationOverlay, type AnnotationRailGeometry } from './AnnotationOverlay';
import { chordStaffSpacing } from '../music/annotationLayout';
import { AnnotationRail } from './AnnotationRail';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const AUTO_SCROLL_DURATION_MS = 280;
const AUTO_SCROLL_RESUME_DURATION_MS = 320;

type SvgBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const measureHighlightBounds = (
  container: HTMLDivElement,
  measureIndex: number,
  elements: SVGGraphicsElement[],
): SvgBounds => {
  const contentBoxes = elements.map((element) => element.getBBox());
  const contentLeft = Math.min(...contentBoxes.map((box) => box.x));
  const contentTop = Math.min(...contentBoxes.map((box) => box.y));
  const contentRight = Math.max(...contentBoxes.map((box) => box.x + box.width));
  const contentBottom = Math.max(...contentBoxes.map((box) => box.y + box.height));
  const lineClass = elements
    .flatMap((element) => Array.from(element.classList))
    .find((className) => /^abcjs-l\d+$/.test(className));
  const endBarBoxes = elements
    .filter((element) => element.classList.contains('abcjs-bar'))
    .map((element) => element.getBBox());
  const staffBoxes = lineClass
    ? Array.from(container.querySelectorAll<SVGGraphicsElement>(`.abcjs-staff.${lineClass}`))
      .filter((element) => typeof element.getBBox === 'function')
      .map((element) => element.getBBox())
    : [];
  const previousBarBoxes = measureIndex > 0 && lineClass
    ? Array.from(container.querySelectorAll<SVGGraphicsElement>(
      `.abcjs-mm${measureIndex - 1}.abcjs-bar.${lineClass}`,
    ))
      .filter((element) => typeof element.getBBox === 'function')
      .map((element) => element.getBBox())
    : [];

  const left = previousBarBoxes.length > 0
    ? Math.max(...previousBarBoxes.map((box) => box.x + box.width))
    : staffBoxes.length > 0
      ? Math.min(...staffBoxes.map((box) => box.x))
      : contentLeft;
  const right = endBarBoxes.length > 0
    ? Math.min(...endBarBoxes.map((box) => box.x))
    : contentRight;
  const verticalBoxes = endBarBoxes.length > 0
    ? endBarBoxes
    : staffBoxes.length > 0
      ? staffBoxes
      : contentBoxes;
  const top = Math.min(...verticalBoxes.map((box) => box.y));
  const bottom = Math.max(...verticalBoxes.map((box) => box.y + box.height));

  if (right <= left || bottom <= top) {
    return {
      x: contentLeft,
      y: contentTop,
      width: contentRight - contentLeft,
      height: contentBottom - contentTop,
    };
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
};

const resolveClickedMeasure = (
  abcElem: { measureNumber?: number } | null | undefined,
  classes = '',
  analysis?: { measure?: number },
): number | null => {
  const globalMeasure = classes.match(/(?:^|\s)abcjs-mm(\d+)(?:\s|$)/);
  if (globalMeasure) return Number(globalMeasure[1]) + 1;
  if (typeof analysis?.measure === 'number') return analysis.measure + 1;
  if (typeof abcElem?.measureNumber === 'number') return abcElem.measureNumber + 1;
  // Cannot resolve measure — returning null prevents clobbering selectionOriginRef
  // with a bogus measure 1 when clicking on staff lines, barlines, or whitespace.
  return null;
};

const highlightMeasures = (container: HTMLDivElement, anchor: ScoreAnchor | null) => {
  container.querySelectorAll('.abcjs-measure-highlight').forEach((element) => element.remove());
  if (!anchor) return;

  for (let measure = anchor.startMeasure; measure <= anchor.endMeasure; measure += 1) {
    const measureIndex = Math.max(0, measure - 1);
    const elements = Array.from(container.querySelectorAll<SVGGraphicsElement>(
      `.abcjs-mm${measureIndex}`,
    )).filter((element) => typeof element.getBBox === 'function');
    if (elements.length === 0) continue;

    const bounds = measureHighlightBounds(container, measureIndex, elements);
    const svg = elements[0].ownerSVGElement;
    if (!svg) continue;

    const highlight = document.createElementNS(SVG_NAMESPACE, 'rect');
    highlight.classList.add('abcjs-measure-highlight');
    highlight.dataset.measure = String(measure);
    highlight.setAttribute('x', String(bounds.x));
    highlight.setAttribute('y', String(bounds.y));
    highlight.setAttribute('width', String(bounds.width));
    highlight.setAttribute('height', String(bounds.height));
    highlight.setAttribute('rx', '2');
    highlight.setAttribute('aria-hidden', 'true');
    const firstScoreElement = Array.from(svg.children)
      .find((element) => !element.classList.contains('abcjs-measure-highlight'));
    svg.insertBefore(highlight, firstScoreElement || null);
  }
};

const getRenderedMeasureCount = (container: HTMLDivElement) => {
  const indexes = Array.from(container.querySelectorAll('[class*="abcjs-mm"]')).flatMap((element) => (
    Array.from(element.classList).flatMap((className) => {
      const match = className.match(/^abcjs-mm(\d+)$/);
      return match ? [Number(match[1])] : [];
    })
  ));
  return indexes.length > 0 ? Math.max(...indexes) + 1 : 1;
};

type SelectionModifiers = Readonly<{
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}>;

const selectionModifiers = (event: MouseEvent | KeyboardEvent): SelectionModifiers => ({
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
});

const NO_SELECTION_MODIFIERS: SelectionModifiers = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

/**
 * Given a client-space coordinate, finds which rendered measure hit area contains
 * that point and returns its 1-based measure number. Returns null if the point
 * is outside all hit areas (e.g. between systems or in the page margin).
 */
const resolveMeasureFromClientXY = (
  container: HTMLDivElement,
  clientX: number,
  clientY: number,
): number | null => {
  const hitAreas = container.querySelectorAll<SVGElement>('.abcjs-measure-hit-area');
  for (const hitArea of Array.from(hitAreas)) {
    const rect = hitArea.getBoundingClientRect();
    if (
      clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom
    ) {
      const measure = Number(hitArea.dataset.measure);
      return Number.isFinite(measure) && measure > 0 ? measure : null;
    }
  }
  return null;
};

const installMeasureHitAreas = (
  container: HTMLDivElement,
  onSelectMeasure: (measure: number, modifiers: SelectionModifiers) => void,
) => {
  container.querySelectorAll('.abcjs-measure-hit-area').forEach((element) => element.remove());
  const measureCount = getRenderedMeasureCount(container);

  for (let measure = 1; measure <= measureCount; measure += 1) {
    const elements = Array.from(container.querySelectorAll<SVGGraphicsElement>(
      `.abcjs-mm${measure - 1}`,
    )).filter((element) => typeof element.getBBox === 'function');
    if (elements.length === 0) continue;

    const boxes = elements.map((element) => element.getBBox());
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const svg = elements[0].ownerSVGElement;
    if (!svg) continue;

    const hitArea = document.createElementNS(SVG_NAMESPACE, 'rect');
    hitArea.classList.add('abcjs-measure-hit-area');
    hitArea.dataset.measure = String(measure);
    hitArea.setAttribute('x', String(left - 8));
    hitArea.setAttribute('y', String(top - 12));
    hitArea.setAttribute('width', String(right - left + 16));
    hitArea.setAttribute('height', String(bottom - top + 24));
    hitArea.setAttribute('rx', '6');
    hitArea.setAttribute('role', 'button');
    hitArea.setAttribute('tabindex', '0');
    hitArea.setAttribute('aria-label', `Select measure ${measure}`);
    hitArea.setAttribute('aria-pressed', 'false');
    hitArea.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectMeasure(measure, selectionModifiers(event));
    });
    hitArea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelectMeasure(measure, selectionModifiers(event));
    });
    svg.appendChild(hitArea);
  }
};

const updateMeasureHitAreaSelection = (
  container: HTMLDivElement,
  anchor: ScoreAnchor | null,
) => {
  container.querySelectorAll<SVGElement>('.abcjs-measure-hit-area').forEach((hitArea) => {
    const measure = Number(hitArea.dataset.measure);
    const selected = Boolean(
      anchor
      && measure >= anchor.startMeasure
      && measure <= anchor.endMeasure,
    );
    hitArea.setAttribute('aria-pressed', String(selected));
  });
};

interface SheetMusicViewProps {
  abcCode: string;
  annotations?: readonly Annotation[];
  activeAnchor?: ScoreAnchor | null;
  navigationAnchor?: ScoreAnchor | null;
  onSelectAnchor?: (anchor: ScoreAnchor | null) => void;
  onTuneRendered?: (tune: abcjs.TuneObject[] | null) => void;
  getPlaybackPosition?: () => PlaybackPosition;
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
  meter?: string;
  onCreateAnnotation?: (annotation: Annotation) => void;
  onUpdateAnnotation?: (annotation: Annotation) => void;
  onDeleteAnnotation?: (annotationId: AnnotationId) => void;
}

export const SheetMusicView: React.FC<SheetMusicViewProps> = ({
  abcCode,
  annotations = [],
  activeAnchor = null,
  navigationAnchor = null,
  onSelectAnchor,
  onTuneRendered,
  getPlaybackPosition,
  zoom = 100,
  onZoomChange,
  meter,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sheetViewportRef = useRef<HTMLDivElement>(null);
  const [internalZoom, setInternalZoom] = useState<number>(zoom);
  const currentZoom = onZoomChange !== undefined ? zoom : internalZoom;
  const [transpose, setTranspose] = useState<number>(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderGeneration, setRenderGeneration] = useState(0);
  const [annotationEditor, setAnnotationEditor] = useState<
    { mode: 'manual' } | { mode: 'accepted'; annotationId: AnnotationId } | null
  >(null);
  const [annotationRailGeometry, setAnnotationRailGeometry] = useState<AnnotationRailGeometry>({
    anchorYByAnnotationId: {},
    scoreHeight: 0,
  });

  const handleAnnotationRailGeometry = React.useCallback((geometry: AnnotationRailGeometry) => {
    setAnnotationRailGeometry((current) => {
      const keys = Object.keys(geometry.anchorYByAnnotationId);
      if (
        current.scoreHeight === geometry.scoreHeight
        && keys.length === Object.keys(current.anchorYByAnnotationId).length
        && keys.every((key) => (
          current.anchorYByAnnotationId[key] === geometry.anchorYByAnnotationId[key]
        ))
      ) return current;
      return geometry;
    });
  }, []);

  useEffect(() => {
    setAnnotationEditor(null);
  }, [abcCode]);

  useEffect(() => {
    if (
      annotationEditor?.mode === 'accepted'
      && !annotations.some(({ id }) => id === annotationEditor.annotationId)
    ) {
      setAnnotationEditor(null);
    }
  }, [annotationEditor, annotations]);

  const handleZoomChange = React.useCallback((newZoom: number) => {
    const clamped = Math.max(50, Math.min(200, newZoom));
    if (onZoomChange) {
      onZoomChange(clamped);
    } else {
      setInternalZoom(clamped);
    }
  }, [onZoomChange]);

  React.useLayoutEffect(() => {
    const viewport = sheetViewportRef.current;
    if (!viewport) return;
    let frame: number | null = null;
    let attempts = 0;
    const center = () => {
      frame = null;
      const notation = viewport.querySelector<HTMLElement>('.sheet-notation-column');
      if (!notation) return;
      const viewportRect = viewport.getBoundingClientRect();
      const notationRect = notation.getBoundingClientRect();
      const delta = notationRect.left + notationRect.width / 2
        - (viewportRect.left + viewportRect.width / 2);
      if (Math.abs(delta) <= 0.5 || attempts >= 4) return;
      viewport.scrollLeft += delta;
      attempts += 1;
      frame = window.requestAnimationFrame(center);
    };
    const schedule = () => {
      if (frame !== null) return;
      attempts = 0;
      frame = window.requestAnimationFrame(center);
    };
    schedule();
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [currentZoom, renderGeneration]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 10 : -10;
        handleZoomChange(currentZoom + delta);
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [currentZoom, handleZoomChange]);

  const measureOccurrencesRef = useRef<MeasureOccurrence[]>([]);
  const renderedTuneRef = useRef<abcjs.TuneObject | null>(null);
  const selectionOriginRef = useRef<{ measure: number; abcOffset?: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!abcCode.trim()) {
      containerRef.current.innerHTML = '';
      setRenderError(null);
      onTuneRendered?.(null);
      measureOccurrencesRef.current = [];
      renderedTuneRef.current = null;
      setRenderGeneration((current) => current + 1);
      return;
    }

    let capturedModifiers = NO_SELECTION_MODIFIERS;
    // True when a hit area click handler already called selectMeasure for this
    // event. The abcjs clickListener fires after (its coordinate hit-testing can
    // resolve the wrong measure in SVG coordinate space), so we skip it in that
    // case. Reset to false at the start of every new click by captureModifiers.
    let hitAreaJustHandled = false;
    const captureModifiers = (event: MouseEvent) => {
      capturedModifiers = selectionModifiers(event);
      hitAreaJustHandled = false;
    };
    const renderedContainer = containerRef.current;
    renderedContainer.addEventListener('click', captureModifiers, true);

    // Defined here (outside try) so the cleanup return can reference it.
    // Registered inside the try (below) after hit areas are installed.
    let handleContainerFallbackClick: (event: MouseEvent) => void = () => {};

    try {
      setRenderError(null);
      containerRef.current.innerHTML = '';
      let renderedTune: abcjs.TuneObject | null = null;
      const selectMeasure = (
        measure: number,
        abcOffset?: number,
        modifiers: SelectionModifiers = NO_SELECTION_MODIFIERS,
      ) => {
        const extending = modifiers.shiftKey && selectionOriginRef.current !== null;
        if (!extending) selectionOriginRef.current = { measure, abcOffset };
        const origin = selectionOriginRef.current || { measure, abcOffset };
        const startMeasure = Math.min(origin.measure, measure);
        const endMeasure = Math.max(origin.measure, measure);
        const startAbcOffset = startMeasure === measure ? abcOffset : origin.abcOffset;
        const occurrences = measureOccurrencesRef.current;
        const selected = selectMeasureWithRepeats(
          startMeasure,
          occurrences,
          getPlaybackPosition?.().currentSeconds || 0,
        );

        const measureCount = getRenderedMeasureCount(containerRef.current!);
        const fallbackFraction = Math.max(0, Math.min(1, (startMeasure - 1) / measureCount));
        renderedTune?.setTiming?.(renderedTune.getBpm?.());
        const totalTime = renderedTune?.getTotalTime?.();
        const playbackSeconds = selected?.startTimeSec ?? (
          Number.isFinite(totalTime) && totalTime! > 0
            ? totalTime! * fallbackFraction
            : undefined
        );
        const playbackFraction = selected?.playbackFraction ?? fallbackFraction;

        const newAnchor: ScoreAnchor = {
          startMeasure,
          endMeasure,
          abcOffset: startAbcOffset,
          label: startMeasure === endMeasure
            ? `m. ${startMeasure}`
            : `mm. ${startMeasure}–${endMeasure}`,
          playbackFraction,
          ...(playbackSeconds !== undefined ? { playbackSeconds } : {}),
        };
        onSelectAnchor?.(newAnchor);
      };

      const visualTranspose = transpose;
      const spacing = chordStaffSpacing();
      const tunes = abcjs.renderAbc(containerRef.current, prepareAbcForPlayback(abcCode), {
        responsive: 'resize',
        scale: 1,
        staffwidth: 740,
        wrap: {
          minSpacing: 1.5,
          maxSpacing: 3,
          preferredMeasuresPerLine: 4,
        },
        // abcjs's render-option format whitelist omits these supported spacing
        // fields, so apply them to the parsed tune consumed by the renderer.
        afterParsing: (tune) => {
          Object.assign(tune.formatting, spacing);
          return tune;
        },
        add_classes: true,
        clickListener: (abcElem: any, _tuneNumber, classes, analysis) => {
          // If a hit area already handled this click (and set hitAreaJustHandled),
          // abcjs's SVG coordinate hit-testing is unreliable and may resolve a
          // different measure, so we skip it entirely.
          if (hitAreaJustHandled) return;
          const modifiersToUse = capturedModifiers;
          capturedModifiers = NO_SELECTION_MODIFIERS;
          if (!abcElem) return;
          const measure = resolveClickedMeasure(abcElem, classes, analysis);
          if (measure === null) return;
          selectMeasure(measure, abcElem.startChar, modifiersToUse);
        },
        visualTranspose: visualTranspose,
        foregroundColor: '#000000',
        paddingtop: 15,
        paddingbottom: 15,
        paddingleft: 15,
        paddingright: 15,
      });
      renderedTune = tunes?.[0] || null;
      renderedTuneRef.current = renderedTune;
      hideSyntheticTupletRests(abcCode, tunes);
      configureAudioPlayback(abcCode, tunes);
      measureOccurrencesRef.current = renderedTune ? buildMeasureOccurrences(renderedTune) : [];
      installMeasureHitAreas(containerRef.current, (measure, modifiers) => {
        // Mark that the hit area handled this click so the abcjs clickListener
        // (which may fire after with wrong SVG-space coordinates) gets skipped.
        hitAreaJustHandled = true;
        selectMeasure(measure, undefined, modifiers);
      });

      // Fallback: catch clicks that bubbled up without being stopped by a hit area.
      // This happens when the user clicks on a barline, staff line, rest, system
      // margin, or any other spot abcjs doesn't fire a clickListener for.
      // Without this, those clicks silently leave selectionOriginRef stale, so the
      // next shift-click range starts from the wrong measure.
      // NOTE: hit areas call stopPropagation, so this handler only fires for clicks
      // that the hit area didn't catch — zero double-calls for normal clicks.
      handleContainerFallbackClick = (event: MouseEvent) => {
        const measure = resolveMeasureFromClientXY(renderedContainer, event.clientX, event.clientY);
        if (measure !== null) {
          selectMeasure(measure, undefined, selectionModifiers(event));
        }
      };
      renderedContainer.addEventListener('click', handleContainerFallbackClick, false);

      if (tunes && tunes.length > 0 && onTuneRendered) {
        onTuneRendered(tunes);
      } else {
        onTuneRendered?.(null);
      }
      setRenderGeneration((current) => current + 1);
    } catch (err: any) {
      console.error('abcjs render error:', err);
      containerRef.current.innerHTML = '';
      onTuneRendered?.(null);
      measureOccurrencesRef.current = [];
      renderedTuneRef.current = null;
      setRenderError(err?.message || 'Failed to render sheet music SVG.');
      setRenderGeneration((current) => current + 1);
    }
    return () => {
      renderedContainer.removeEventListener('click', captureModifiers, true);
      renderedContainer.removeEventListener('click', handleContainerFallbackClick, false);
    };
  }, [abcCode, getPlaybackPosition, onSelectAnchor, onTuneRendered, transpose]);

  useEffect(() => {
    if (!containerRef.current) return;
    highlightMeasures(containerRef.current, activeAnchor);
    updateMeasureHitAreaSelection(containerRef.current, activeAnchor);
    // Keep selectionOriginRef consistent with the displayed anchor so that
    // shift-clicks always extend from the correct measure even after external
    // navigation, file switch, or annotation-driven anchor changes.
    if (!activeAnchor) {
      selectionOriginRef.current = null;
    } else {
      const originMeasure = selectionOriginRef.current?.measure;
      const isOriginInsideAnchor = (
        originMeasure !== undefined
        && originMeasure >= activeAnchor.startMeasure
        && originMeasure <= activeAnchor.endMeasure
      );
      if (!isOriginInsideAnchor) {
        selectionOriginRef.current = {
          measure: activeAnchor.startMeasure,
          abcOffset: activeAnchor.abcOffset,
        };
      }
    }
  }, [abcCode, activeAnchor, transpose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !navigationAnchor) return;

    const startMeasure = navigationAnchor.startMeasure;
    const selected = selectMeasureWithRepeats(
      startMeasure,
      measureOccurrencesRef.current,
      getPlaybackPosition?.().currentSeconds || 0,
    );
    const measureCount = getRenderedMeasureCount(container);
    const fallbackFraction = Math.max(0, Math.min(1, (startMeasure - 1) / measureCount));
    const tune = renderedTuneRef.current;
    tune?.setTiming?.(tune.getBpm?.());
    const totalTime = tune?.getTotalTime?.();
    const playbackSeconds = selected?.startTimeSec ?? (
      Number.isFinite(totalTime) && totalTime! > 0
        ? totalTime! * fallbackFraction
        : undefined
    );
    const resolvedAnchor: ScoreAnchor = {
      ...navigationAnchor,
      label: navigationAnchor.startMeasure === navigationAnchor.endMeasure
        ? `m. ${navigationAnchor.startMeasure}`
        : `mm. ${navigationAnchor.startMeasure}–${navigationAnchor.endMeasure}`,
      playbackFraction: selected?.playbackFraction ?? fallbackFraction,
      ...(playbackSeconds !== undefined ? { playbackSeconds } : {}),
    };
    selectionOriginRef.current = { measure: startMeasure };
    onSelectAnchor?.(resolvedAnchor);

    const hitArea = container.querySelector<SVGElement>(
      `.abcjs-measure-hit-area[data-measure="${startMeasure}"]`,
    );
    hitArea?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    hitArea?.focus();
  }, [getPlaybackPosition, navigationAnchor, onSelectAnchor]);

  const isPlayingRef = useRef<boolean>(false);
  const isUserPausedRef = useRef<boolean>(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smoothScrollControllerRef = useRef<SmoothScrollController | null>(null);
  const lastLineTopRef = useRef<number | null>(null);

  const performAutoCenter = React.useCallback((smoothDurationMs?: number) => {
    if (!containerRef.current) return;
    const scrollContainer = containerRef.current.closest<HTMLElement>('.score-canvas')
      || document.querySelector<HTMLElement>('.score-canvas');
    if (!scrollContainer) return;

    const cursorEl = containerRef.current.querySelector('.abcjs-playback-cursor');
    if (!cursorEl) return;

    const targetScrollTop = calculateCenterScrollTop(scrollContainer, cursorEl, 0.33);

    if (smoothDurationMs && smoothDurationMs > 0) {
      smoothScrollControllerRef.current?.cancel();
      smoothScrollControllerRef.current = animateScrollTo(
        scrollContainer,
        targetScrollTop,
        smoothDurationMs,
      );
    } else {
      scrollContainer.scrollTop = targetScrollTop;
    }
  }, []);

  useEffect(() => {
    const scrollContainer = containerRef.current?.closest<HTMLElement>('.score-canvas')
      || document.querySelector<HTMLElement>('.score-canvas');
    if (!scrollContainer) return;

    const handleUserScroll = () => {
      const playing = getPlaybackPosition?.().isPlaying || isPlayingRef.current;
      if (!playing) return;

      smoothScrollControllerRef.current?.cancel();
      isUserPausedRef.current = true;

      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }

      pauseTimerRef.current = setTimeout(() => {
        isUserPausedRef.current = false;
        const currentPlaying = getPlaybackPosition?.().isPlaying || isPlayingRef.current;
        if (currentPlaying) {
          performAutoCenter(AUTO_SCROLL_RESUME_DURATION_MS);
        }
      }, 2000);
    };

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        handleUserScroll();
      }
    };

    const handleTouchMove = () => {
      handleUserScroll();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Space', 'Home', 'End'].includes(e.key)) {
        handleUserScroll();
      }
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: true });
    scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: true });
    scrollContainer.addEventListener('keydown', handleKeyDown, { passive: true });

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel);
      scrollContainer.removeEventListener('touchmove', handleTouchMove);
      scrollContainer.removeEventListener('keydown', handleKeyDown);
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }
      smoothScrollControllerRef.current?.cancel();
    };
  }, [getPlaybackPosition, performAutoCenter]);

  useEffect(() => {
    const handleCursorMove = (event: Event) => {
      const playing = getPlaybackPosition?.().isPlaying || isPlayingRef.current;
      if (!playing || isUserPausedRef.current) return;

      if (!containerRef.current) return;
      const scrollContainer = containerRef.current.closest<HTMLElement>('.score-canvas')
        || document.querySelector<HTMLElement>('.score-canvas');
      if (!scrollContainer) return;

      const cursorEl = containerRef.current.querySelector('.abcjs-playback-cursor');
      if (!cursorEl) return;

      const cursorEvent = event as CustomEvent<{ top?: number }>;
      const eventLineTop = cursorEvent.detail?.top;
      const svgLineTopAttribute = cursorEl.getAttribute('y1');
      const svgLineTop = svgLineTopAttribute === null ? null : Number(svgLineTopAttribute);
      const cursorRect = cursorEl.getBoundingClientRect();
      // Compare in score coordinates so our own scrolling is not mistaken for a new staff line.
      const currentLineTop = typeof eventLineTop === 'number' && Number.isFinite(eventLineTop)
        ? eventLineTop
        : svgLineTop !== null && Number.isFinite(svgLineTop)
          ? svgLineTop
          : cursorRect.top + scrollContainer.scrollTop;

      if (lastLineTopRef.current === null) {
        lastLineTopRef.current = currentLineTop;
        performAutoCenter(AUTO_SCROLL_DURATION_MS);
      } else if (Math.abs(currentLineTop - lastLineTopRef.current) > 8) {
        lastLineTopRef.current = currentLineTop;
        performAutoCenter(AUTO_SCROLL_DURATION_MS);
      }
    };

    const handlePlaybackState = (e: Event) => {
      const customEv = e as CustomEvent<{ isPlaying: boolean }>;
      const playing = Boolean(customEv.detail?.isPlaying);
      isPlayingRef.current = playing;
      if (!playing) {
        isUserPausedRef.current = false;
        lastLineTopRef.current = null;
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        smoothScrollControllerRef.current?.cancel();
      }
    };

    window.addEventListener('chorale-playback-cursor', handleCursorMove);
    window.addEventListener('chorale-playback-state', handlePlaybackState);

    return () => {
      window.removeEventListener('chorale-playback-cursor', handleCursorMove);
      window.removeEventListener('chorale-playback-state', handlePlaybackState);
    };
  }, [getPlaybackPosition, performAutoCenter]);

  const anchorLabel = formatAnchorLabel(activeAnchor);
  const editedAnnotation = annotationEditor?.mode === 'accepted'
    ? annotations.find(({ id }) => id === annotationEditor.annotationId)
    : undefined;

  const closeAnnotationEditor = (returnTarget: 'manual' | AnnotationId) => {
    setAnnotationEditor(null);
    window.requestAnimationFrame(() => {
      const attribute = returnTarget === 'manual'
        ? '[data-create-annotation]'
        : '[data-edit-annotation]';
      const controls = cardRef.current?.querySelectorAll<HTMLElement>(attribute);
      const target = Array.from(controls || []).find((control) => (
        returnTarget === 'manual' || control.dataset.editAnnotation === returnTarget
      ));
      (target || cardRef.current?.querySelector<HTMLElement>('[data-annotation-rail-heading]'))
        ?.focus({ preventScroll: true });
    });
  };

  const selectRangeAnnotation = React.useCallback((
    annotation: RangeAnnotation,
    initiator: HTMLButtonElement,
  ) => {
    onSelectAnchor?.(annotation.span);
    const hitArea = containerRef.current?.querySelector<SVGElement>(
      `.abcjs-measure-hit-area[data-measure="${annotation.span.startMeasure}"]`,
    );
    hitArea?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    queueMicrotask(() => initiator.focus({ preventScroll: true }));
  }, [onSelectAnchor]);

  const annotationEditorNode = annotationEditor?.mode === 'manual' && activeAnchor ? (
    <AnnotationEditor
      mode="manual"
      defaultSpan={activeAnchor}
      meter={meter}
      onSave={(annotation) => {
        if (!onCreateAnnotation) throw new Error('Annotation creation is unavailable.');
        onCreateAnnotation(annotation);
        closeAnnotationEditor('manual');
      }}
      onCancel={() => closeAnnotationEditor('manual')}
    />
  ) : annotationEditor?.mode === 'accepted' && editedAnnotation ? (
    <AnnotationEditor
      mode="accepted"
      variant={editedAnnotation.kind === 'chord' ? 'chord-inline' : 'full'}
      initialAnnotation={editedAnnotation}
      defaultSpan={editedAnnotation.span}
      meter={meter}
      onSave={(annotation) => {
        if (!onUpdateAnnotation) throw new Error('Annotation editing is unavailable.');
        onUpdateAnnotation(annotation);
        closeAnnotationEditor(annotation.id);
      }}
      onCancel={() => closeAnnotationEditor(editedAnnotation.id)}
      onDelete={() => {
        if (!onDeleteAnnotation) throw new Error('Annotation deletion is unavailable.');
        onDeleteAnnotation(editedAnnotation.id);
        closeAnnotationEditor(editedAnnotation.id);
      }}
    />
  ) : null;

  return (
    <div ref={cardRef} className="sheet-music-card glass-panel">
      {/* ... header & controls ... */}
      <div className="sheet-header">
        <div className="sheet-title-group">
          <h3 className="section-title">Interactive Sheet Music</h3>
          {anchorLabel && (
            <div className="active-anchor-badge ml-3">
              <Tag className="w-3.5 h-3.5 mr-1 inline text-coral" />
              <span>Selected: <strong>{anchorLabel}</strong></span>
              <button
                type="button"
                className="clear-anchor-btn ml-1"
                onClick={() => onSelectAnchor?.(null)}
                title="Clear Selection"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="sheet-controls">
          <div className="control-group">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400 mr-1" />
            <span className="control-label">Key:</span>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setTranspose((t) => t - 1)}
              title="Transpose down 1 semitone"
            >
              -1
            </button>
            <span className="transpose-val">{transpose > 0 ? `+${transpose}` : transpose}</span>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setTranspose((t) => t + 1)}
              title="Transpose up 1 semitone"
            >
              +1
            </button>
            {transpose !== 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setTranspose(0)}
                title="Reset Transpose"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="control-group">
            <button
              className="btn btn-sm btn-icon"
              onClick={() => handleZoomChange(currentZoom - 10)}
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="scale-val">{Math.round(currentZoom)}%</span>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => handleZoomChange(currentZoom + 10)}
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {renderError && (
        <div className="error-banner">
          <span>Sheet music render issue: {renderError}</span>
        </div>
      )}

      <div ref={sheetViewportRef} className="sheet-viewport">
        <div className="sheet-scene-positioner">
          <div
            className="sheet-zoom-wrapper"
            data-score-zoom={currentZoom}
            style={{ zoom: currentZoom / 100 }}
          >
            <div className="sheet-annotation-layout">
              <div className="sheet-layout-balance" aria-hidden="true" />
              <div className="sheet-notation-column">
                <div ref={containerRef} id="paper" className="abcjs-paper-container" />
                <AnnotationOverlay
                  paperRef={containerRef}
                  abcCode={abcCode}
                  annotations={annotations}
                  tune={renderedTuneRef.current}
                  renderGeneration={renderGeneration}
                  zoom={currentZoom}
                  activeAnnotationId={
                    annotationEditor?.mode === 'accepted' ? annotationEditor.annotationId : null
                  }
                  inlineChordEditor={editedAnnotation?.kind === 'chord' ? annotationEditorNode : null}
                  onRangeGeometry={handleAnnotationRailGeometry}
                  onActivate={(annotation) => {
                    onSelectAnchor?.(annotation.span);
                    setAnnotationEditor({ mode: 'accepted', annotationId: annotation.id });
                  }}
                />
              </div>
              <div className="annotation-rail-viewport">
                <AnnotationRail
                  annotations={annotations}
                  editing={annotationEditor}
                  editor={editedAnnotation?.kind === 'chord' ? null : annotationEditorNode}
                  anchorYByAnnotationId={annotationRailGeometry.anchorYByAnnotationId}
                  scoreHeight={annotationRailGeometry.scoreHeight}
                  onSelect={selectRangeAnnotation}
                  onEdit={(annotation) => {
                    onSelectAnchor?.(annotation.span);
                    const hitArea = containerRef.current?.querySelector<SVGElement>(
                      `.abcjs-measure-hit-area[data-measure="${annotation.span.startMeasure}"]`,
                    );
                    hitArea?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
                    setAnnotationEditor({ mode: 'accepted', annotationId: annotation.id });
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SheetMusicView;
