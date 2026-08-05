import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseMeasureReference } from '../agent/measureReferences';
import type { ScoreAnchor } from '../types/document';

interface MarkdownMessageProps {
  content: string;
  totalMeasures: number;
  onNavigateMeasure: (anchor: ScoreAnchor) => void;
}

export function MarkdownMessage({
  content,
  totalMeasures,
  onNavigateMeasure,
}: MarkdownMessageProps) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => {
            const anchor = parseMeasureReference(href, totalMeasures);
            if (anchor) {
              return (
                <button
                  type="button"
                  className="markdown-link score-reference-link"
                  onClick={() => onNavigateMeasure(anchor)}
                >
                  {children}
                </button>
              );
            }
            return (
              <span
                className="markdown-link markdown-link-disabled"
                aria-disabled="true"
              >
                {children}
              </span>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
