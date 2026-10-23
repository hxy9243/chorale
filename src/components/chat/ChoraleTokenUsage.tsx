import { memo, useState } from 'react';
import type { RoundUsage } from '../../agent/types';

interface ChoraleTokenUsageProps {
  usage?: RoundUsage;
  conversationTotalTokens?: number;
}

export const ChoraleTokenUsage = memo(function ChoraleTokenUsage({
  usage,
  conversationTotalTokens,
}: ChoraleTokenUsageProps) {
  const [expanded, setExpanded] = useState(false);

  if (!usage) {
    return (
      <div className="agent-token-usage agent-token-usage-unavailable" style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 4 }}>
        Tokens unavailable
      </div>
    );
  }

  const roundTotal = usage.totalTokens.toLocaleString();
  const convTotal = (conversationTotalTokens ?? usage.totalTokens).toLocaleString();

  return (
    <div className="agent-token-usage" style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 6 }}>
      <button
        type="button"
        className="agent-token-summary-btn"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'inherit',
          cursor: 'pointer',
          font: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
        aria-expanded={expanded}
      >
        <span>Round {roundTotal} tokens · Conversation {convTotal} tokens</span>
        <span style={{ fontSize: '0.65rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div
          className="agent-token-breakdown"
          style={{
            marginTop: 4,
            padding: '6px 8px',
            borderRadius: 4,
            backgroundColor: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '2px 12px',
          }}
        >
          <div>Prompt: <strong>{usage.input.toLocaleString()}</strong></div>
          <div>Completion: <strong>{usage.output.toLocaleString()}</strong></div>
          {usage.cacheRead > 0 && <div>Cache Read: <strong>{usage.cacheRead.toLocaleString()}</strong></div>}
          {usage.cacheWrite > 0 && <div>Cache Write: <strong>{usage.cacheWrite.toLocaleString()}</strong></div>}
          {usage.reasoning !== undefined && (
            <div>Reasoning: <strong>{usage.reasoning.toLocaleString()}</strong> <em>(subset of completion)</em></div>
          )}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(128, 128, 128, 0.2)', paddingTop: 2, marginTop: 2 }}>
            Total: <strong>{usage.totalTokens.toLocaleString()}</strong>
          </div>
        </div>
      )}
    </div>
  );
});
