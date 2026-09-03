import { memo, useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';
import { CHORALE_STREAMDOWN_REHYPE_PLUGINS } from './streamdownConfig';

interface ChoraleReasoningViewProps {
  reasoning: string;
  status?: 'streaming' | 'complete' | 'stopped';
}

export const ChoraleReasoningView = memo(function ChoraleReasoningView({
  reasoning,
  status = 'complete',
}: ChoraleReasoningViewProps) {
  const isStreaming = status === 'streaming';
  const [isOpen, setIsOpen] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  const trimmed = reasoning.trim();
  const displayContent = trimmed.length > 0 ? trimmed : (isStreaming ? 'Thinking…' : '*Reasoning redacted or unavailable*');

  return (
    <details
      className={`agent-thinking-trace ${isStreaming ? 'is-streaming' : ''}`}
      open={isOpen}
      onToggle={(e) => {
        setIsOpen((e.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="agent-thinking-summary">
        <span>Thinking</span>
        {isStreaming && (
          <span className="agent-thinking-indicator">
            <span className="agent-thinking-pulse" />
            streaming…
          </span>
        )}
      </summary>

      <div className="agent-thinking-body">
        <Streamdown
          mode={isStreaming ? 'streaming' : 'static'}
          controls={false}
          rehypePlugins={CHORALE_STREAMDOWN_REHYPE_PLUGINS}
        >
          {displayContent}
        </Streamdown>
      </div>
    </details>
  );
});
