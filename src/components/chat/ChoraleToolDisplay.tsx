import { memo } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ChatToolDisplay } from '../../agent/types';

interface ChoraleToolDisplayProps {
  tool: ChatToolDisplay;
}

export const ChoraleToolDisplay = memo(function ChoraleToolDisplay({ tool }: ChoraleToolDisplayProps) {
  const formattedDuration = tool.durationMs !== undefined
    ? tool.durationMs < 1000
      ? `${tool.durationMs}ms`
      : `${(tool.durationMs / 1000).toFixed(1)}s`
    : null;

  const isRunning = tool.status === 'running';
  const isError = tool.status === 'error';

  return (
    <div
      className="agent-tool-row"
      data-status={tool.status}
      data-tool-call-id={tool.toolCallId}
      data-tool-name={tool.toolName}
    >
      <div className="agent-tool-icon" aria-hidden="true">
        {isRunning ? (
          <Loader2 size={13} className="agent-tool-spinner" />
        ) : isError ? (
          <AlertCircle size={13} className="agent-tool-error-icon" />
        ) : (
          <CheckCircle2 size={13} className="agent-tool-success-icon" />
        )}
      </div>
      <span className="agent-tool-summary">{tool.summary}</span>
      {formattedDuration && (
        <span className="agent-tool-duration">
          {formattedDuration}
        </span>
      )}
    </div>
  );
});
