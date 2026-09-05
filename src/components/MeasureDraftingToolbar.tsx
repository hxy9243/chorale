import React, { useEffect, useRef, useState } from 'react';
import { ListMinus, ListPlus, X } from 'lucide-react';
import type { MeasureSpan } from '../types/document';
import {
  type MeasureMutation,
  type MeasureMutationResult,
} from '../music/scoreDrafting';

export type MeasureDraftingToolbarProps = {
  span: MeasureSpan;
  onMutate(mutation: MeasureMutation): MeasureMutationResult;
};

const spanLabel = (span: MeasureSpan) => span.startMeasure === span.endMeasure
  ? `Measure ${span.startMeasure}`
  : `Measures ${span.startMeasure}–${span.endMeasure}`;

export const MeasureDraftingToolbar: React.FC<MeasureDraftingToolbarProps> = ({
  span,
  onMutate,
}) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteParaRef = useRef<HTMLParagraphElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setDeleteConfirmOpen(false);
    setErrors([]);
  }, [span.endMeasure, span.startMeasure]);

  useEffect(() => {
    if (!deleteConfirmOpen) return undefined;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => {
      deleteParaRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDeleteConfirmOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [deleteConfirmOpen]);

  const handleAdd = (position: 'before' | 'after') => {
    setErrors([]);
    const result = onMutate({
      kind: 'insert',
      span,
      position,
      count: 1,
    });
    if (result.status !== 'valid') {
      setErrors(result.errors);
    }
  };

  const openDeleteConfirm = () => {
    setErrors([]);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = onMutate({ kind: 'delete', span });
    if (result.status === 'valid') {
      setDeleteConfirmOpen(false);
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <>
      <div className="measure-drafting-toolbar" role="group" aria-label={`Edit ${spanLabel(span)}`}>
        <span className="measure-drafting-toolbar-label">{spanLabel(span)}</span>
        <button type="button" onClick={() => handleAdd('before')}><ListPlus size={14} /> Add before</button>
        <button type="button" onClick={() => handleAdd('after')}><ListPlus size={14} /> Add after</button>
        <button type="button" className="danger" onClick={openDeleteConfirm}><ListMinus size={14} /> Delete</button>
      </div>

      {errors.length > 0 && !deleteConfirmOpen && (
        <div className="editor-banner error abc-draft-error" role="alert">
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="score-drafting-modal-overlay" role="presentation">
          <div
            ref={dialogRef}
            className="score-drafting-modal measure-edit-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="measure-delete-modal-title"
          >
            <header className="score-drafting-modal-header">
              <div>
                <h2 id="measure-delete-modal-title">Delete measures?</h2>
                <p>{spanLabel(span)}</p>
              </div>
              <button
                type="button"
                className="score-drafting-icon-button"
                onClick={() => setDeleteConfirmOpen(false)}
                aria-label="Close measure editor"
              >
                <X size={17} />
              </button>
            </header>
            <form onSubmit={handleDeleteSubmit}>
              <div className="measure-edit-modal-body">
                <p ref={deleteParaRef} tabIndex={-1}>
                  This removes {spanLabel(span).toLowerCase()} from every voice. You can restore it with Undo.
                </p>
                <div className="new-score-errors" role={errors.length ? 'alert' : 'status'} aria-live="polite">
                  {errors.map((error) => <p key={error}>{error}</p>)}
                </div>
              </div>
              <footer className="score-drafting-modal-footer">
                <button
                  type="button"
                  className="score-drafting-secondary-button"
                  onClick={() => setDeleteConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="measure-delete-confirm">
                  Delete measures
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default MeasureDraftingToolbar;
