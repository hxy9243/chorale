import React, { memo } from 'react';
import { Streamdown } from 'streamdown';
import { parseMeasureReference } from '../../agent/measureReferences';
import type { ScoreAnchor } from '../../types/document';
import { CHORALE_STREAMDOWN_REHYPE_PLUGINS } from './streamdownConfig';

interface ChoraleStreamdownMessageProps {
  content: string;
  isStreaming?: boolean;
  totalMeasures: number;
  onNavigateMeasure: (anchor: ScoreAnchor) => void;
}

export const ChoraleStreamdownMessage = memo(function ChoraleStreamdownMessage({
  content,
  isStreaming = false,
  totalMeasures,
  onNavigateMeasure,
}: ChoraleStreamdownMessageProps) {
  const components = {
    a: ({ children, href }: React.ComponentProps<'a'>) => {
      const anchor = parseMeasureReference(href, totalMeasures);
      if (anchor) {
        return (
          <button
            type="button"
            className="markdown-link score-reference-link"
            onClick={(e) => {
              e.preventDefault();
              onNavigateMeasure(anchor);
            }}
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
    table: ({ children, node: _node, ...props }: React.ComponentProps<'table'> & { node?: unknown }) => (
      <div className="chorale-table-container">
        <table className="chorale-table" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, node: _node, ...props }: React.ComponentProps<'thead'> & { node?: unknown }) => (
      <thead className="chorale-table-thead" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, node: _node, ...props }: React.ComponentProps<'tbody'> & { node?: unknown }) => (
      <tbody className="chorale-table-tbody" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, node: _node, ...props }: React.ComponentProps<'tr'> & { node?: unknown }) => (
      <tr className="chorale-table-row" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, align, node: _node, ...props }: React.ComponentProps<'th'> & { node?: unknown }) => {
      const textAlign = align === 'left' || align === 'right' || align === 'center' || align === 'justify' ? align : undefined;
      return (
        <th
          className="chorale-table-header-cell"
          style={textAlign ? { textAlign } : undefined}
          {...props}
        >
          {children}
        </th>
      );
    },
    td: ({ children, align, node: _node, ...props }: React.ComponentProps<'td'> & { node?: unknown }) => {
      const textAlign = align === 'left' || align === 'right' || align === 'center' || align === 'justify' ? align : undefined;
      return (
        <td
          className="chorale-table-cell"
          style={textAlign ? { textAlign } : undefined}
          {...props}
        >
          {children}
        </td>
      );
    },
  };

  return (
    <div className="chorale-streamdown-message markdown-message">
      <Streamdown
        key={`streamdown-${totalMeasures}-${isStreaming}`}
        mode={isStreaming ? 'streaming' : 'static'}
        controls={false}
        rehypePlugins={CHORALE_STREAMDOWN_REHYPE_PLUGINS}
        components={components}
      >
        {content}
      </Streamdown>
    </div>
  );
});
