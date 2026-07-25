import React from 'react';
import { Eye, EyeOff, Tag, ZoomIn, ZoomOut } from 'lucide-react';

interface ScoreCardHeaderProps {
  title: string;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  anchorContext?: string | null;
  buildStatus?: 'idle' | 'building' | 'valid' | 'invalid';
  saveState?: string;
  editorVisible?: boolean;
  onToggleEditor?: () => void;
}

export const ScoreCardHeader: React.FC<ScoreCardHeaderProps> = ({
  title,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  anchorContext,
  buildStatus = 'valid',
  saveState = 'Saved',
  editorVisible = false,
  onToggleEditor = () => undefined,
}) => {
  return (
    <div className="score-card-header">
      <div className="score-header-title-group">
        <h2 className="score-title">{title || 'Untitled Score'}</h2>
        <span className={`status-pill ${saveState === 'Draft' ? 'status-draft' : 'status-saved'}`}>
          {saveState}
        </span>
        <span className={`status-pill status-${buildStatus}`}>
          {buildStatus}
        </span>
      </div>

      <div className="score-header-actions">
        {anchorContext && (
          <div className="anchor-chip">
            <Tag size={12} className="mr-1 inline text-coral" />
            <span>{anchorContext}</span>
          </div>
        )}

        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={onToggleEditor}
        >
          {editorVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          {editorVisible ? 'Hide ABC' : 'Show ABC'}
        </button>

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
