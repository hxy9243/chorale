import React from 'react';
import { MessageSquare, PanelLeft, Settings } from 'lucide-react';

interface HeaderProps {
  activeFileName?: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  railCollapsed?: boolean;
  onToggleRail?: () => void;
  saveState?: string;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeFileName = '',
  chatOpen = true,
  onToggleChat,
  railCollapsed = false,
  onToggleRail,
  saveState = 'Saved',
  onOpenSettings,
}) => {
  const saveLabel = saveState === 'Saved' || saveState === 'Auto-saved'
    ? 'Auto-saved'
    : saveState === 'Saving'
      ? 'Saving…'
      : saveState === 'Error'
        ? 'Save failed'
        : saveState;
  const saveClassName = saveState === 'Saving'
    ? 'draft'
    : saveState === 'Error'
      ? 'error'
      : '';

  return (
    <header className="app-header">
      <div className="header-brand">
        <button
          type="button"
          className={`header-icon-btn sidebar-toggle-btn ${railCollapsed ? 'collapsed' : ''}`}
          onClick={onToggleRail}
          title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
        <div className="brand-mark" aria-hidden="true">C</div>
        <span>Chorale</span>
      </div>

      <div className="header-breadcrumb" aria-label="Current score">
        <strong>{activeFileName || 'Untitled score'}</strong>
      </div>

      <div className="header-right">
        <span
          className={`header-save-pill ${saveClassName}`}
          role="status"
          aria-live="polite"
          title={saveState === 'Error' ? 'Changes could not be saved in this browser.' : undefined}
        >
          {saveLabel}
        </span>
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
        <button
          type="button"
          className="header-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
