import React from 'react';
import { MessageSquare } from 'lucide-react';

interface HeaderProps {
  activeFileName?: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  saveStatus?: 'saved' | 'saving' | 'error';
  canRenderScore?: boolean;
  hasPlayback?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeFileName = '',
  chatOpen = true,
  onToggleChat,
  saveStatus,
  canRenderScore,
  hasPlayback,
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
      <div className="header-brand">
        <span>Chorale</span>
      </div>

      <div className="header-breadcrumb" aria-label="Current score">
        <strong>{activeFileName || 'Untitled score'}</strong>
      </div>

      <div className="header-right">
        {(saveLabel || canRenderScore !== undefined || hasPlayback !== undefined) && (
          <div className="header-status-group" role="status" aria-live="polite">
            {saveLabel && (
              <span className={`header-status-pill score-status-item save ${saveStatus}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>{saveLabel}</span>
              </span>
            )}
            {canRenderScore !== undefined && (
              <span className={`header-status-pill score-status-item svg ${canRenderScore ? 'ready' : 'pending'}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>SVG {canRenderScore ? 'ready' : 'pending'}</span>
              </span>
            )}
            {hasPlayback !== undefined && (
              <span className={`header-status-pill score-status-item audio ${hasPlayback ? 'ready' : 'pending'}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>Music {hasPlayback ? 'ready' : 'pending'}</span>
              </span>
            )}
          </div>
        )}

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
