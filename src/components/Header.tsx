import React from 'react';
import { MessageSquare } from 'lucide-react';

interface HeaderProps {
  activeFileName?: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeFileName = '',
  chatOpen = true,
  onToggleChat,
}) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <span>Chorale</span>
      </div>

      <div className="header-breadcrumb" aria-label="Current score">
        <strong>{activeFileName || 'Untitled score'}</strong>
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
