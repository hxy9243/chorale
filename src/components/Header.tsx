import React from 'react';
import { MessageCircle, Music, Sparkles } from 'lucide-react';

interface HeaderProps {
  chatOpen?: boolean;
  onToggleChat?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ chatOpen = false, onToggleChat }) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon">
          <Music className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="brand-title">Chorale Player</h1>
          <p className="brand-subtitle">MusicXML &rarr; ABC Sheet Music & WebAudio Synth</p>
        </div>
      </div>
      <div className="header-actions">
        {onToggleChat && (
          <button
            type="button"
            className={`btn btn-secondary header-chat-button ${chatOpen ? 'active' : ''}`}
            onClick={onToggleChat}
            aria-expanded={chatOpen}
            aria-controls="current-sheet-agent"
          >
            <MessageCircle size={16} />
            Ask
          </button>
        )}
        <span className="badge badge-poc">
          <Sparkles className="w-3.5 h-3.5 inline mr-1" />
          abcjs + xml2abc PoC
        </span>
      </div>
    </header>
  );
};
