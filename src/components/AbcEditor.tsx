import React, { useState } from 'react';
import { Code2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface AbcEditorProps {
  abcCode: string;
  onAbcChange: (newAbc: string) => void;
}

export const AbcEditor: React.FC<AbcEditorProps> = ({ abcCode, onAbcChange }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(abcCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="abc-editor-card glass-panel">
      <div className="editor-header">
        <button
          className="editor-toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Code2 className="w-4 h-4 text-emerald-400 mr-2" />
          <span className="section-title">ABC Notation Code</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 ml-2 opacity-70" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-2 opacity-70" />
          )}
        </button>

        <div className="editor-actions">
          <button
            className="btn btn-sm btn-ghost"
            onClick={handleCopy}
            title="Copy ABC Notation to Clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy ABC
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="editor-body">
          <textarea
            className="abc-textarea"
            value={abcCode}
            onChange={(e) => onAbcChange(e.target.value)}
            placeholder="Parsed ABC code will appear here. Edit code directly to re-render score..."
            rows={10}
            spellCheck={false}
          />
          <p className="editor-hint">
            Tip: You can modify the ABC code directly above to adjust notes, keys, or title in real-time.
          </p>
        </div>
      )}
    </div>
  );
};
