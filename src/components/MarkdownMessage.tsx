import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseMeasureReference } from '../agent/measureReferences';
import type { ScoreAnchor } from '../types/document';

interface MarkdownMessageProps {
  content: string;
  totalMeasures: number;
  onNavigateMeasure: (anchor: ScoreAnchor) => void;
}

type MessageSegment = Readonly<{
  kind: 'answer' | 'thinking';
  content: string;
  complete: boolean;
}>;

const splitThinkingSegments = (content: string): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  const lowerContent = content.toLowerCase();
  const startTag = '<think>';
  const endTag = '</think>';
  let cursor = 0;

  while (cursor < content.length) {
    const start = lowerContent.indexOf(startTag, cursor);
    if (start < 0) {
      segments.push({ kind: 'answer', content: content.slice(cursor), complete: true });
      break;
    }

    if (start > cursor) {
      segments.push({ kind: 'answer', content: content.slice(cursor, start), complete: true });
    }

    const thinkingStart = start + startTag.length;
    const end = lowerContent.indexOf(endTag, thinkingStart);
    if (end < 0) {
      segments.push({ kind: 'thinking', content: content.slice(thinkingStart), complete: false });
      cursor = content.length;
      break;
    }

    segments.push({
      kind: 'thinking',
      content: content.slice(thinkingStart, end),
      complete: true,
    });
    cursor = end + endTag.length;
  }

  return segments.filter((segment) => segment.content.trim().length > 0);
};

export function MarkdownMessage({
  content,
  totalMeasures,
  onNavigateMeasure,
}: MarkdownMessageProps) {
  const segments = splitThinkingSegments(content);
  const markdownComponents = {
    a: ({ children, href }: React.ComponentProps<'a'>) => {
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
  };

  return (
    <div className="markdown-message">
      {segments.map((segment, index) => (
        segment.kind === 'thinking' ? (
          <details
            className="agent-thinking-trace"
            key={`thinking-${index}`}
            open={!segment.complete}
          >
            <summary>{segment.complete ? 'Thinking' : 'Thinking…'}</summary>
            <blockquote>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={markdownComponents}
              >
                {segment.content}
              </ReactMarkdown>
            </blockquote>
          </details>
        ) : (
          <ReactMarkdown
            key={`answer-${index}`}
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={markdownComponents}
          >
            {segment.content}
          </ReactMarkdown>
        )
      ))}
    </div>
  );
}
