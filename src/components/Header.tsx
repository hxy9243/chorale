import React from 'react';
import { FileCode2, FileMusic, Piano, Redo2, Undo2 } from 'lucide-react';

interface HeaderProps {
  sheetVisible?: boolean;
  editorVisible?: boolean;
  onToggleSheet?: () => void;
  onToggleEditor?: () => void;
  waterfallVisible?: boolean;
  onToggleWaterfall?: () => void;
  activeFileName?: string;
  saveStatus?: 'saved' | 'saving' | 'error';
  canRenderScore?: boolean;
  hasPlayback?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeFileName = '',
  sheetVisible = true,
  editorVisible = false,
  onToggleSheet,
  onToggleEditor,
  waterfallVisible = false,
  onToggleWaterfall,
  saveStatus,
  canRenderScore,
  hasPlayback,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const statusLabel = saveStatus === 'error' ? 'Save failed'
    : saveStatus === 'saving' ? 'Saving…'
      : canRenderScore && hasPlayback ? 'Music ready' : 'Music pending';
  const showStatus = saveStatus !== undefined || canRenderScore !== undefined || hasPlayback !== undefined;
  const statusClass = saveStatus === 'error' ? 'error' : statusLabel === 'Music ready' ? 'ready' : 'pending';

  return (
    <header className="app-header">
      <div className="header-center">
        <div className="header-breadcrumb" aria-label="Current score">
          <strong>{activeFileName || 'Untitled score'}</strong>
        </div>

        {(onUndo || onRedo) && (
          <div className="header-history-actions" role="group" aria-label="Edit history actions">
            <button
              type="button"
              className="header-history-btn undo"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo last edit (Ctrl+Z / ⌘Z)"
              aria-label="Undo last edit"
            >
              <Undo2 size={14} aria-hidden="true" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="header-history-btn redo"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo edit (Ctrl+Shift+Z / ⌘Shift+Z)"
              aria-label="Redo edit"
            >
              <Redo2 size={14} aria-hidden="true" />
              <span>Redo</span>
            </button>
          </div>
        )}

        <div className="header-right">
          <div className="header-pane-actions" role="group" aria-label="Pane visibility">
            {onToggleSheet && <button type="button" className="header-history-btn" aria-label="Sheet" title="Sheet" aria-pressed={sheetVisible} onClick={onToggleSheet}><FileMusic size={14} aria-hidden="true" /><span>Sheet</span></button>}
            {onToggleEditor && <button type="button" className="header-history-btn" aria-label="ABC code" title="ABC code" aria-pressed={editorVisible} onClick={onToggleEditor}><FileCode2 size={14} aria-hidden="true" /><span>ABC code</span></button>}
            {onToggleWaterfall && <button type="button" className="header-history-btn" aria-label="Waterfall" title="Waterfall" aria-pressed={waterfallVisible} onClick={onToggleWaterfall}><Piano size={14} aria-hidden="true" /><span>Waterfall</span></button>}
          </div>
          {showStatus && <div className="header-status-group" role="status" aria-live="polite">
            <span className={`header-status-pill ${statusClass}`}>
              <span className="status-dot" aria-hidden="true" />
              <span>{statusLabel}</span>
            </span>
          </div>}
        </div>
      </div>
    </header>
  );
};
