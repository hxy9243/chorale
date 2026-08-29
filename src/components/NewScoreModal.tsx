import React, { useEffect, useRef, useState } from 'react';
import { Music2, X } from 'lucide-react';
import {
  createBlankPianoScore,
  MAX_DRAFT_MEASURES,
  MAX_DRAFT_TEMPO,
  MIN_DRAFT_MEASURES,
  MIN_DRAFT_TEMPO,
} from '../music/scoreDrafting';

export type NewScoreModalProps = {
  open: boolean;
  onClose(): void;
  onCreate(abcSource: string, title: string): void;
};

export const NewScoreModal: React.FC<NewScoreModalProps> = ({ open, onClose, onCreate }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [title, setTitle] = useState('Untitled score');
  const [subtitle, setSubtitle] = useState('');
  const [composer, setComposer] = useState('');
  const [keySignature, setKeySignature] = useState('C');
  const [meter, setMeter] = useState('4/4');
  const [tempo, setTempo] = useState('120');
  const [measures, setMeasures] = useState('8');
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setTitle('Untitled score');
    setSubtitle('');
    setComposer('');
    setKeySignature('C');
    setMeter('4/4');
    setTempo('120');
    setMeasures('8');
    setErrors([]);
    window.requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
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
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = createBlankPianoScore({
      title,
      subtitle,
      composer,
      key: keySignature,
      meter,
      tempo: Number(tempo),
      measures: Number(measures),
    });
    if (result.status === 'invalid') {
      setErrors(result.errors);
      return;
    }
    onCreate(result.abcSource, result.title);
    onClose();
  };

  return (
    <div
      className="score-drafting-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="score-drafting-modal new-score-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-score-title"
        aria-describedby="new-score-description"
      >
        <header className="score-drafting-modal-header">
          <span className="score-drafting-modal-icon" aria-hidden="true"><Music2 size={17} /></span>
          <div>
            <h2 id="new-score-title">New Score</h2>
            <p id="new-score-description">Start with a blank piano score.</p>
          </div>
          <button type="button" className="score-drafting-icon-button" onClick={onClose} aria-label="Close New Score">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit} noValidate>
          <div className="new-score-form-grid">
            <label className="new-score-form-wide">
              <span>Title</span>
              <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="new-score-form-wide">
              <span>Subtitle <small>Optional</small></span>
              <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
            </label>
            <label className="new-score-form-wide">
              <span>Composer <small>Optional</small></span>
              <input value={composer} onChange={(event) => setComposer(event.target.value)} />
            </label>
            <label>
              <span>Key</span>
              <input value={keySignature} onChange={(event) => setKeySignature(event.target.value)} aria-describedby="new-score-key-hint" />
              <small id="new-score-key-hint">ABC key, such as C or Dm</small>
            </label>
            <label>
              <span>Meter</span>
              <input value={meter} onChange={(event) => setMeter(event.target.value)} aria-describedby="new-score-meter-hint" />
              <small id="new-score-meter-hint">ABC meter, such as 4/4</small>
            </label>
            <label>
              <span>Tempo</span>
              <input
                type="number"
                min={MIN_DRAFT_TEMPO}
                max={MAX_DRAFT_TEMPO}
                step="1"
                value={tempo}
                onChange={(event) => setTempo(event.target.value)}
              />
              <small>Beats per minute</small>
            </label>
            <label>
              <span>Measures</span>
              <input
                type="number"
                min={MIN_DRAFT_MEASURES}
                max={MAX_DRAFT_MEASURES}
                step="1"
                value={measures}
                onChange={(event) => setMeasures(event.target.value)}
              />
              <small>1–256 measures</small>
            </label>
            <div className="new-score-instrument new-score-form-wide">
              <span>Instrument</span>
              <strong>Piano · two staves</strong>
            </div>
          </div>

          <div className="new-score-errors" role={errors.length ? 'alert' : 'status'} aria-live="polite">
            {errors.map((error) => <p key={error}>{error}</p>)}
          </div>

          <footer className="score-drafting-modal-footer">
            <button type="button" className="score-drafting-secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="score-drafting-primary-button">Create score</button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default NewScoreModal;
