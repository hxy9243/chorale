import React from 'react';
import { MessageCircle, Music, Share2, Check } from 'lucide-react';


interface HeaderProps {
  activeFileName?: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeFileName = '', chatOpen = false, onToggleChat }) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-brand">
          <div className="brand-logo font-bold">
            <Music className="w-5 h-5 text-coral inline mr-1.5" />
            <span>Chorale</span>
          </div>
        </div>
      </div>

      <div className="header-center">
        {activeFileName && (
          <div className="header-file-title">
            <span className="file-title-text">{activeFileName}</span>
            <span className="status-pill status-saved ml-2">
              <Check size={12} className="inline mr-0.5" />
              Saved
            </span>
          </div>
        )}
      </div>

      <div className="header-right">
        <button type="button" className="btn btn-secondary header-action-btn" title="Share Project">
          <Share2 size={15} />
          <span>Share</span>
        </button>
        {onToggleChat && (
          <button
            type="button"
            className={`btn header-chat-button ${chatOpen ? 'btn-primary active' : 'btn-secondary'}`}
            onClick={onToggleChat}
            aria-expanded={chatOpen}
            aria-controls="current-sheet-agent"
          >
            <MessageCircle size={15} />
            <span>Ask Agent</span>
          </button>
        )}
      </div>
    </header>
  );
};

