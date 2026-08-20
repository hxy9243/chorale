import React, { useEffect, useRef } from 'react';
import {
  History,
  X,
  Undo2,
  Redo2,
  CheckCircle2,
  FileCode,
  Tag,
  Music2,
  Sparkles,
} from 'lucide-react';
import type { EditHistoryEntry } from '../types/document';

export interface EditingHistoryModalProps {
  open: boolean;
  onClose: () => void;
  scoreTitle: string;
  history: EditHistoryEntry[];
  activeHistoryIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRevertTo: (idOrIndex: string | number) => void;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export const EditingHistoryModal: React.FC<EditingHistoryModalProps> = ({
  open,
  onClose,
  scoreTitle,
  history,
  activeHistoryIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRevertTo,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Scroll active history entry into view when modal opens
  useEffect(() => {
    if (open && activeItemRef.current && typeof activeItemRef.current.scrollIntoView === 'function') {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open, activeHistoryIndex]);

  if (!open) return null;

  const currentEntry = history[activeHistoryIndex] || history[history.length - 1];

  return (
    <div className="history-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="history-modal-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        aria-describedby="history-modal-subtitle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-modal-header">
          <div className="history-header-title-wrap">
            <div className="history-icon-badge" aria-hidden="true">
              <History size={18} />
            </div>
            <div>
              <h2 id="history-modal-title" className="history-modal-heading">
                Editing History
              </h2>
              <p id="history-modal-subtitle" className="history-modal-subheading">
                {scoreTitle || 'Untitled score'} · {history.length} {history.length === 1 ? 'step' : 'steps'} from origin
              </p>
            </div>
          </div>

          <div className="history-modal-header-actions">
            <div className="history-quick-controls" role="group" aria-label="History step navigation">
              <button
                type="button"
                className="history-nav-btn"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo step (Ctrl+Z)"
                aria-label="Undo step"
              >
                <Undo2 size={14} aria-hidden="true" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                className="history-nav-btn"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo step (Ctrl+Shift+Z)"
                aria-label="Redo step"
              >
                <Redo2 size={14} aria-hidden="true" />
                <span>Redo</span>
              </button>
            </div>

            <button
              type="button"
              className="history-close-btn"
              onClick={onClose}
              title="Close history popup (Esc)"
              aria-label="Close history window"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="history-modal-status-bar">
          <div className="history-status-indicator">
            <span className="history-step-tag">
              Step {activeHistoryIndex + 1} of {history.length}
            </span>
            <span className="history-step-summary">
              Current state: <strong>{currentEntry?.summary || 'Origin'}</strong>
            </span>
          </div>
          <div className="history-legend" aria-hidden="true">
            <span className="legend-item origin">Origin</span>
            <span className="legend-item metadata">Metadata</span>
            <span className="legend-item body">Body</span>
            <span className="legend-item annotation">Annotations</span>
          </div>
        </div>

        <div className="history-list-container" role="list" aria-label="Chronological editing steps">
          {history.length === 0 && (
            <div className="history-empty-state">No editing history available for this score.</div>
          )}

          {history.map((entry, index) => {
            const isCurrent = index === activeHistoryIndex;
            const categoryClass = entry.category === 'annotation' && entry.annotationKind
              ? `annotation-${entry.annotationKind}`
              : entry.category;

            return (
              <div
                key={entry.id || `entry-${index}`}
                ref={isCurrent ? activeItemRef : undefined}
                className={`history-entry-row ${isCurrent ? 'is-active' : ''} ${categoryClass}`}
                role="listitem"
                data-history-id={entry.id}
                data-category={entry.category}
                data-action={entry.actionType}
                onClick={() => onRevertTo(entry.id)}
              >
                <div className="history-entry-step-col">
                  <span className="history-entry-number">#{index + 1}</span>
                  <div className="history-timeline-connector" aria-hidden="true" />
                </div>

                <div className="history-entry-main">
                  <div className="history-entry-badges">
                    {/* Category badge */}
                    {entry.category === 'origin' && (
                      <span className="category-pill origin">
                        <Sparkles size={11} aria-hidden="true" />
                        <span>Origin</span>
                      </span>
                    )}
                    {entry.category === 'metadata' && (
                      <span className="category-pill metadata">
                        <Tag size={11} aria-hidden="true" />
                        <span>Metadata{entry.metadataField ? ` · ${entry.metadataField}` : ''}</span>
                      </span>
                    )}
                    {entry.category === 'body' && (
                      <span className="category-pill body">
                        <FileCode size={11} aria-hidden="true" />
                        <span>Body ABC</span>
                      </span>
                    )}
                    {entry.category === 'annotation' && (
                      <span className={`category-pill annotation ${entry.annotationKind || 'general'}`}>
                        <Music2 size={11} aria-hidden="true" />
                        <span>
                          {entry.annotationKind
                            ? `Annotation · ${entry.annotationKind.charAt(0).toUpperCase() + entry.annotationKind.slice(1)}`
                            : 'Annotation'}
                        </span>
                      </span>
                    )}

                    {/* Action badge */}
                    {entry.actionType === 'add' && (
                      <span className="action-pill add" title="Added item">
                        + Add
                      </span>
                    )}
                    {entry.actionType === 'edit' && (
                      <span className="action-pill edit" title="Edited item">
                        ✎ Edit
                      </span>
                    )}
                    {entry.actionType === 'delete' && (
                      <span className="action-pill delete" title="Deleted item">
                        − Delete
                      </span>
                    )}
                    {entry.actionType === 'initial' && (
                      <span className="action-pill initial" title="Initial imported score">
                        ★ Initial
                      </span>
                    )}
                  </div>

                  <div className="history-entry-content">
                    <p className="history-entry-summary">{entry.summary}</p>
                    {entry.details && (
                      <span className="history-entry-details">{entry.details}</span>
                    )}
                  </div>
                </div>

                <div className="history-entry-meta">
                  <span className="history-entry-time">{formatTime(entry.timestamp)}</span>
                  {isCurrent ? (
                    <span className="history-active-badge">
                      <CheckCircle2 size={13} aria-hidden="true" />
                      <span>Current</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="history-revert-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevertTo(entry.id);
                      }}
                      title={`Revert document to step #${index + 1}`}
                      aria-label={`Revert score to step #${index + 1}: ${entry.summary}`}
                    >
                      Revert
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="history-modal-footer">
          <p className="history-footer-hint">
            Tip: Click any step in history to revert the music sheet back to that revision.
          </p>
          <button type="button" className="figma-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditingHistoryModal;
