import React from 'react';
import { MessageSquare } from 'lucide-react';

interface HeaderProps {
  activeFileName?: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  saveState?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeFileName = '',
  chatOpen = true,
  onToggleChat,
  saveState = 'Saved',
}) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <span>Chorale</span>
      </div>

      <div className="header-breadcrumb" aria-label="Current score">
        <strong>{activeFileName || 'Untitled score'}</strong>
      </div>

      <div className="header-right">
        <span className={`header-save-pill ${saveState === 'Draft' ? 'draft' : ''}`}>
          {saveState === 'Draft' ? 'Draft changes' : saveState === 'Auto-saved' || saveState === 'Saved' ? 'Auto-saved' : 'Saved just now'}
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
      </div>
    </header>
  );
};
