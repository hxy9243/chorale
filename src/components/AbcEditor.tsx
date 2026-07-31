import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, FileCode2, LoaderCircle, X } from 'lucide-react';

interface AbcEditorProps {
  abcCode: string;
  onAbcChange: (newAbc: string) => void;
  revision?: number;
  validationState?: 'idle' | 'building' | 'valid' | 'invalid';
  validationMessage?: string | null;
  visible?: boolean;
  onToggleVisibility?: () => void;
}

export const AbcEditor: React.FC<AbcEditorProps> = ({
  abcCode,
  onAbcChange,
  revision = 0,
  validationState = 'idle',
  validationMessage,
  visible = true,
  onToggleVisibility = () => undefined,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const lineNumbers = useMemo(() => (
    Array.from({ length: Math.max(abcCode.split('\n').length, 1) }, (_, index) => index + 1)
  ), [abcCode]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(abcCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusLabel = (
    validationState === 'building' ? 'Rebuilding' :
      validationState === 'valid' ? `Valid · r${revision}` :
        validationState === 'invalid' ? 'Invalid ABC' :
          'Waiting for source'
  );

  return (
    <section className={`abc-editor-card glass-panel ${visible ? '' : 'is-collapsed'}`} aria-label="ABC editor pane">
      <div className="editor-header">
        <div className="editor-title-group">
          <FileCode2 className="w-4 h-4" />
          <div>
            <h3>ABC code</h3>
            <p>Revision-aware source for score rendering and playback.</p>
          </div>
        </div>

        <div className="editor-actions">
          <span className={`editor-status-pill ${validationState}`}>
            {validationState === 'building' && <LoaderCircle size={14} className="spin" />}
            {validationState === 'valid' && <Check size={14} />}
            {validationState === 'invalid' && <AlertTriangle size={14} />}
            {statusLabel}
          </span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={handleCopy}
            title="Copy ABC notation to clipboard"
            type="button"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            className="btn btn-sm btn-secondary editor-close-button"
            type="button"
            onClick={onToggleVisibility}
            title="Close ABC editor"
            aria-label="Close ABC editor"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {validationMessage && (
        <div className={`editor-banner ${validationState === 'invalid' ? 'error' : 'info'}`} role="status">
          {validationMessage}
        </div>
      )}

      {visible && (
        <div className="editor-body">
          <div className="editor-line-numbers" aria-hidden="true">
            {lineNumbers.map((lineNumber) => (
              <span key={lineNumber}>{lineNumber}</span>
            ))}
          </div>
          <textarea
            className="abc-textarea"
            value={abcCode}
            onChange={(event) => onAbcChange(event.target.value)}
            placeholder="Parsed ABC code will appear here. Edit code directly to rebuild score output."
            rows={Math.max(lineNumbers.length, 16)}
            spellCheck={false}
          />
        </div>
      )}
    </section>
  );
};
