import React from 'react';
import { MessageSquare } from 'lucide-react';

interface RightRailProps {
  chatOpen?: boolean;
  onToggleChat?: () => void;
}

export const RightRail: React.FC<RightRailProps> = ({
  chatOpen = false,
  onToggleChat,
}) => (
  <aside className="right-rail" aria-label="Chat rail">
    <nav className="right-rail-tabs" aria-label="Chat rail">
      <div className="right-rail-tablist" role="tablist" aria-label="Chat rail panels">
        <button
          type="button"
          className={`right-rail-tab ${chatOpen ? 'active' : ''}`}
          role="tab"
          aria-selected={chatOpen}
          aria-controls="chat-panel"
          aria-label="Chat"
          title="Chat"
          onClick={onToggleChat}
        >
          <MessageSquare size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  </aside>
);

export default RightRail;
