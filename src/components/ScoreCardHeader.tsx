import React, { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';

interface ScoreCardHeaderProps {
  title: string;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

export const ScoreCardHeader: React.FC<ScoreCardHeaderProps> = ({
  title,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const optionsRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const workspace = optionsRef.current?.closest('.score-workspace-card');
    if (!workspace) return undefined;

    const indicateScrolling = () => {
      setScrolling(true);
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
      scrollTimerRef.current = window.setTimeout(() => {
        setScrolling(false);
        scrollTimerRef.current = null;
      }, 320);
    };

    workspace.addEventListener('wheel', indicateScrolling, { capture: true, passive: true });

    return () => {
      workspace.removeEventListener('wheel', indicateScrolling, true);
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={optionsRef}
      className={`score-display-options ${scrolling ? 'is-scrolling' : ''}`}
      role="group"
      aria-label="Score display options"
    >
      <h2 className="sr-only">{title || 'Untitled Score'}</h2>
      <div className="zoom-controls-group">
        <button type="button" className="figma-button zoom-button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
          <span aria-hidden="true">−</span>
        </button>
        <span className="zoom-level-text" aria-live="polite">{zoom}%</span>
        <button type="button" className="figma-button zoom-button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" className="figma-button" onClick={onResetZoom} title="Reset zoom to fit">
          <Maximize2 size={14} aria-hidden="true" />
          Fit
        </button>
      </div>
    </div>
  );
};

export default ScoreCardHeader;
