import React from 'react';
import { Braces, Maximize2, Music2, Pencil, Tag } from 'lucide-react';

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

        <button type="button" className="figma-button">
          <Pencil size={14} />
          Annotate
        </button>

        <button type="button" className="figma-button zoom-button" onClick={onZoomOut} title="Zoom out">
          <span aria-hidden="true">−</span>
          {zoom}%
        </button>
        <button type="button" className="figma-button" onClick={onResetZoom}>
          <Maximize2 size={14} />
          Fit
        </button>
      </div>
    </div>
  );
};

export default ScoreCardHeader;
