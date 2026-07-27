import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { ZoomIn, ZoomOut, RotateCcw, SlidersHorizontal, Tag, X } from 'lucide-react';
import type { ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';
import { buildMeasureOccurrences, selectMeasureWithRepeats, type MeasureOccurrence } from '../utils/repeatPlayback';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const resolveClickedMeasure = (
  abcElem: { measureNumber?: number } | null | undefined,
  classes = '',
  analysis?: { measure?: number },
) => {
  const globalMeasure = classes.match(/(?:^|\s)abcjs-mm(\d+)(?:\s|$)/);
  if (globalMeasure) return Number(globalMeasure[1]) + 1;
  if (typeof analysis?.measure === 'number') return analysis.measure + 1;
  if (typeof abcElem?.measureNumber === 'number') return abcElem.measureNumber + 1;
  return 1;
};

const highlightMeasure = (container: HTMLDivElement, anchor: ScoreAnchor | null) => {
  container.querySelectorAll('.abcjs-measure-highlight').forEach((element) => element.remove());
  if (!anchor) return;

  const elements = Array.from(container.querySelectorAll<SVGGraphicsElement>(
    `.abcjs-mm${Math.max(0, anchor.measure - 1)}`,
  )).filter((element) => typeof element.getBBox === 'function');
  if (elements.length === 0) return;

  const boxes = elements.map((element) => element.getBBox());
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const svg = elements[0].ownerSVGElement;
  if (!svg) return;

  const highlight = document.createElementNS(SVG_NAMESPACE, 'rect');
  highlight.classList.add('abcjs-measure-highlight');
  highlight.setAttribute('x', String(left - 6));
  highlight.setAttribute('y', String(top - 8));
  highlight.setAttribute('width', String(right - left + 12));
  highlight.setAttribute('height', String(bottom - top + 16));
  highlight.setAttribute('rx', '5');
  highlight.setAttribute('aria-hidden', 'true');
  svg.insertBefore(highlight, svg.firstChild);
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

const installMeasureHitAreas = (
  container: HTMLDivElement,
  onSelectMeasure: (measure: number) => void,
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
    hitArea.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectMeasure(measure);
    });
    hitArea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelectMeasure(measure);
    });
    svg.appendChild(hitArea);
  }
};

interface SheetMusicViewProps {
  abcCode: string;
  activeAnchor?: ScoreAnchor | null;
  onSelectAnchor?: (anchor: ScoreAnchor | null) => void;
  onTuneRendered?: (tune: abcjs.TuneObject[] | null) => void;
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
}

export const SheetMusicView: React.FC<SheetMusicViewProps> = ({
  abcCode,
  activeAnchor = null,
  onSelectAnchor,
  onTuneRendered,
  zoom = 100,
  onZoomChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [internalZoom, setInternalZoom] = useState<number>(zoom);
  const currentZoom = onZoomChange !== undefined ? zoom : internalZoom;
  const [transpose, setTranspose] = useState<number>(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  const handleZoomChange = React.useCallback((newZoom: number) => {
    const clamped = Math.max(50, Math.min(200, newZoom));
    if (onZoomChange) {
      onZoomChange(clamped);
    } else {
      setInternalZoom(clamped);
    }
  }, [onZoomChange]);

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

  useEffect(() => {
    if (!containerRef.current) return;

    if (!abcCode.trim()) {
      containerRef.current.innerHTML = '';
      setRenderError(null);
      onTuneRendered?.(null);
      measureOccurrencesRef.current = [];
      return;
    }

    try {
      setRenderError(null);
      containerRef.current.innerHTML = '';
      let renderedTune: abcjs.TuneObject | null = null;
      const selectMeasure = (measure: number, abcOffset?: number) => {
        const occurrences = measureOccurrencesRef.current;
        const selected = selectMeasureWithRepeats(
          measure,
          occurrences,
          0,
          false,
        );

        const measureCount = getRenderedMeasureCount(containerRef.current!);
        const fallbackFraction = Math.max(0, Math.min(1, (measure - 1) / measureCount));
        renderedTune?.setTiming?.(renderedTune.getBpm?.());
        const totalTime = renderedTune?.getTotalTime?.();
        const playbackSeconds = selected?.startTimeSec ?? (
          Number.isFinite(totalTime) && totalTime! > 0
            ? totalTime! * fallbackFraction
            : undefined
        );
        const playbackFraction = selected?.playbackFraction ?? fallbackFraction;

        const newAnchor: ScoreAnchor = {
          measure,
          abcOffset,
          label: `m. ${measure}`,
          playbackFraction,
          ...(playbackSeconds !== undefined ? { playbackSeconds } : {}),
        };
        onSelectAnchor?.(newAnchor);
      };

      const visualTranspose = transpose;
      const tunes = abcjs.renderAbc(containerRef.current, abcCode, {
        responsive: 'resize',
        scale: 1,
        staffwidth: 740,
        wrap: {
          minSpacing: 1.5,
          maxSpacing: 3,
          preferredMeasuresPerLine: 4,
        },
        add_classes: true,
        clickListener: (abcElem: any, _tuneNumber, classes, analysis) => {
          if (!abcElem) return;
          const measure = resolveClickedMeasure(abcElem, classes, analysis);
          selectMeasure(measure, abcElem.startChar);
        },
        visualTranspose: visualTranspose,
        foregroundColor: '#000000',
        paddingtop: 15,
        paddingbottom: 15,
        paddingleft: 15,
        paddingright: 15,
      });
      renderedTune = tunes?.[0] || null;
      measureOccurrencesRef.current = renderedTune ? buildMeasureOccurrences(renderedTune) : [];
      installMeasureHitAreas(containerRef.current, (measure) => selectMeasure(measure));

      if (tunes && tunes.length > 0 && onTuneRendered) {
        onTuneRendered(tunes);
      } else {
        onTuneRendered?.(null);
      }
    } catch (err: any) {
      console.error('abcjs render error:', err);
      containerRef.current.innerHTML = '';
      onTuneRendered?.(null);
      measureOccurrencesRef.current = [];
      setRenderError(err?.message || 'Failed to render sheet music SVG.');
    }
  }, [abcCode, onSelectAnchor, onTuneRendered, transpose]);

  useEffect(() => {
    if (!containerRef.current) return;
    highlightMeasure(containerRef.current, activeAnchor);
  }, [abcCode, activeAnchor, transpose]);

  const anchorLabel = formatAnchorLabel(activeAnchor);

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

      <div className="sheet-viewport">
        <div
          className="sheet-zoom-wrapper"
          style={{
            zoom: currentZoom / 100,
            transformOrigin: 'top center',
            width: '100%',
          }}
        >
          <div ref={containerRef} id="paper" className="abcjs-paper-container" />
        </div>
      </div>
    </div>
  );
};

export default SheetMusicView;
