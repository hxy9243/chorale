import React from 'react';
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
  return (
    <div className="score-display-options" role="group" aria-label="Score display options">
      <h2 className="sr-only">{title || 'Untitled Score'}</h2>
      <div className="zoom-controls-group">
        <button type="button" className="figma-button zoom-button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
          <span aria-hidden="true">−</span>
        </button>
        <span className="zoom-level-text">{zoom}%</span>
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
