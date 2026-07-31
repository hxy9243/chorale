import React from 'react';
import { Braces, Maximize2, Music2, Tag } from 'lucide-react';

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
  editorVisible = false,
  onToggleEditor = () => undefined,
}) => {
  return (
    <div className="score-card-header">
      <h2 className="sr-only">{title || 'Untitled Score'}</h2>
      <div className="score-view-switch">
        <button
          type="button"
          className={`figma-button ${editorVisible ? '' : 'active'}`}
          onClick={() => editorVisible && onToggleEditor()}
        >
          <Music2 size={14} />
          Score
        </button>
        <button type="button" className={`figma-button ${editorVisible ? 'active' : ''}`} onClick={onToggleEditor}>
          <Braces size={14} />
          ABC code
        </button>
      </div>

      <div className="score-header-actions">
        {anchorContext && (
          <div className="anchor-chip">
            <Tag size={12} />
            <span>{anchorContext}</span>
          </div>
        )}

        <div className="zoom-controls-group">
          <button type="button" className="figma-button zoom-button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
            <span aria-hidden="true">−</span>
          </button>
          <span className="zoom-level-text">{zoom}%</span>
          <button type="button" className="figma-button zoom-button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" className="figma-button" onClick={onResetZoom} title="Reset zoom to fit">
            <Maximize2 size={14} />
            Fit
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScoreCardHeader;
