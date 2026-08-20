import React from 'react';
import { MessageSquare, Redo2, Undo2 } from 'lucide-react';

interface HeaderProps {
  activeFileName?: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
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
  chatOpen = true,
  onToggleChat,
  saveStatus,
  canRenderScore,
  hasPlayback,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const saveLabel = saveStatus === 'saved'
    ? 'Auto-saved'
    : saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'error'
        ? 'Save failed'
        : null;

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-brand">
          <span>Chorale</span>
        </div>
      </div>

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

        {(saveLabel || canRenderScore !== undefined || hasPlayback !== undefined) && (
          <div className="header-status-group" role="status" aria-live="polite">
            {saveLabel && (
              <span className={`header-status-pill score-status-item save ${saveStatus}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>{saveLabel}</span>
              </span>
            )}
            {canRenderScore !== undefined && (
              <span className={`header-status-pill svg ${canRenderScore ? 'ready' : 'pending'}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>SVG {canRenderScore ? 'ready' : 'pending'}</span>
              </span>
            )}
            {hasPlayback !== undefined && (
              <span className={`header-status-pill audio ${hasPlayback ? 'ready' : 'pending'}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>Music {hasPlayback ? 'ready' : 'pending'}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="header-right">
        <button
          type="button"
          className={`header-chat-button ${chatOpen ? 'active' : ''}`}
          onClick={onToggleChat}
          aria-expanded={chatOpen}
          aria-controls="current-sheet-agent"
          title={chatOpen ? 'Hide score chat' : 'Show score chat'}
        >
          <MessageSquare size={15} aria-hidden="true" />
          <span>Chat</span>
        </button>
      </div>
    </header>
  );
};
