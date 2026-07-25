import React from 'react';
import { ZoomIn, ZoomOut, Check, Tag } from 'lucide-react';

interface ScoreCardHeaderProps {
  title: string;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  anchorContext?: string | null;
}

export const ScoreCardHeader: React.FC<ScoreCardHeaderProps> = ({
  title,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  anchorContext,
}) => {
  return (
    <div className="score-card-header">
      <div className="score-header-title-group">
        <h2 className="score-title">{title || 'Untitled Score'}</h2>
        <span className="status-pill status-saved">
          <Check size={12} className="inline mr-1" />
          Saved
        </span>
        <span className="status-pill status-ready">Ready</span>
      </div>

      <div className="score-header-actions">
        {anchorContext && (
          <div className="anchor-chip">
            <Tag size={12} className="mr-1 inline text-coral" />
            <span>{anchorContext}</span>
          </div>
        )}

        <div className="zoom-controls">
          <button
            type="button"
            className="zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="zoom-value-btn"
            onClick={onResetZoom}
            title="Reset Zoom"
          >
            {zoom}%
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={onZoomIn}
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScoreCardHeader;
