import React, { useEffect, useRef, useState } from 'react';
import { ListMinus, ListPlus, X } from 'lucide-react';
import type { MeasureSpan } from '../types/document';
import {
  MAX_DRAFT_MEASURES,
  MIN_DRAFT_MEASURES,
  type MeasureMutation,
  type MeasureMutationResult,
} from '../music/scoreDrafting';

type DraftingAction = 'insert-before' | 'insert-after' | 'delete';

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
  const [action, setAction] = useState<DraftingAction | null>(null);
  const [count, setCount] = useState('1');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialInputRef = useRef<HTMLInputElement>(null);
  const initialParaRef = useRef<HTMLParagraphElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setAction(null);
    setErrors([]);
  }, [span.endMeasure, span.startMeasure]);

  useEffect(() => {
    if (!action) return undefined;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => {
      if (action === 'delete') {
        initialParaRef.current?.focus();
      } else {
        initialInputRef.current?.focus();
      }
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setAction(null);
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
  }, [action]);

  const open = (nextAction: DraftingAction) => {
    setErrors([]);
    setCount('1');
    setAction(nextAction);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!action) return;
    const mutation: MeasureMutation = action === 'delete'
      ? { kind: 'delete', span }
      : {
          kind: 'insert',
          span,
          position: action === 'insert-before' ? 'before' : 'after',
          count: Number(count),
        };
    const result = onMutate(mutation);
    if (result.status === 'valid') {
      setAction(null);
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <>
      <div className="measure-drafting-toolbar" role="group" aria-label={`Edit ${spanLabel(span)}`}>
        <span className="measure-drafting-toolbar-label">{spanLabel(span)}</span>
        <button type="button" onClick={() => open('insert-before')}><ListPlus size={14} /> Add before</button>
        <button type="button" onClick={() => open('insert-after')}><ListPlus size={14} /> Add after</button>
        <button type="button" className="danger" onClick={() => open('delete')}><ListMinus size={14} /> Delete</button>
      </div>

      {action && (
        <div className="score-drafting-modal-overlay" role="presentation">
          <div
            ref={dialogRef}
            className="score-drafting-modal measure-edit-modal"
            role={action === 'delete' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="measure-edit-modal-title"
          >
            <header className="score-drafting-modal-header">
              <div>
                <h2 id="measure-edit-modal-title">
                  {action === 'delete' ? 'Delete measures?' : 'Add measures'}
                </h2>
                <p>{spanLabel(span)}</p>
              </div>
              <button type="button" className="score-drafting-icon-button" onClick={() => setAction(null)} aria-label="Close measure editor">
                <X size={17} />
              </button>
            </header>
            <form onSubmit={submit}>
              <div className="measure-edit-modal-body">
                {(action === 'insert-before' || action === 'insert-after') && (
                  <label>
                    <span>Number of measures</span>
                    <input
                      ref={initialInputRef}
                      type="number"
                      min={MIN_DRAFT_MEASURES}
                      max={MAX_DRAFT_MEASURES}
                      step="1"
                      value={count}
                      onChange={(event) => setCount(event.target.value)}
                    />
                    <small>Blank full-measure rests are added to every voice.</small>
                  </label>
                )}
                {action === 'delete' && (
                  <p ref={initialParaRef} tabIndex={-1}>
                    This removes {spanLabel(span).toLowerCase()} from every voice. You can restore it with Undo.
                  </p>
                )}
                <div className="new-score-errors" role={errors.length ? 'alert' : 'status'} aria-live="polite">
                  {errors.map((error) => <p key={error}>{error}</p>)}
                </div>
              </div>
              <footer className="score-drafting-modal-footer">
                <button type="button" className="score-drafting-secondary-button" onClick={() => setAction(null)}>Cancel</button>
                <button type="submit" className={action === 'delete' ? 'measure-delete-confirm' : 'score-drafting-primary-button'}>
                  {action === 'delete' ? 'Delete measures' : 'Add measures'}
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
