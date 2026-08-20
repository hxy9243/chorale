import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScoreMetadata,
  validateKeySignature,
  validateMeter,
  validateTempo,
  MIN_TEMPO_BPM,
  MAX_TEMPO_BPM,
} from '../utils/abcMetadata';

export interface ScoreMetadataHeaderProps {
  title?: string;
  composer?: string;
  keySignature?: string;
  meter?: string;
  tempoText?: string;
  tempoBpm?: number;
  voices?: string[];
  onUpdateMetadata: (updates: Partial<ScoreMetadata>) => void;
  disabled?: boolean;
}

type EditableField = 'title' | 'composer' | 'key' | 'meter' | 'tempo';

export const ScoreMetadataHeader: React.FC<ScoreMetadataHeaderProps> = ({
  title = 'Untitled score',
  composer = 'Unknown composer',
  keySignature = 'C',
  meter = '4/4',
  tempoText = '♩ = 120',
  tempoBpm,
  voices = [],
  onUpdateMetadata,
  disabled = false,
}) => {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback((field: EditableField, initialValue: string) => {
    if (disabled) return;
    setEditingField(field);
    setDraftValue(initialValue);
    setErrorMessage(null);
  }, [disabled]);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
    setDraftValue('');
    setErrorMessage(null);
  }, []);

  const commitEditing = useCallback(() => {
    if (!editingField) return;

    const trimmed = draftValue.trim();

    if (editingField === 'title') {
      if (!trimmed) {
        setErrorMessage('Title cannot be empty');
        return;
      }
      onUpdateMetadata({ title: trimmed });
      cancelEditing();
      return;
    }

    if (editingField === 'composer') {
      onUpdateMetadata({ composer: trimmed });
      cancelEditing();
      return;
    }

    if (editingField === 'key') {
      const validation = validateKeySignature(trimmed);
      if (!validation.valid || !validation.value) {
        setErrorMessage(validation.error || 'Invalid key signature');
        return;
      }
      onUpdateMetadata({ key: validation.value });
      cancelEditing();
      return;
    }

    if (editingField === 'meter') {
      const validation = validateMeter(trimmed);
      if (!validation.valid || !validation.value) {
        setErrorMessage(validation.error || 'Invalid time signature');
        return;
      }
      onUpdateMetadata({ meter: validation.value });
      cancelEditing();
      return;
    }

    if (editingField === 'tempo') {
      const validation = validateTempo(trimmed);
      if (!validation.valid || !validation.value) {
        setErrorMessage(validation.error || `Tempo must be ${MIN_TEMPO_BPM}-${MAX_TEMPO_BPM} BPM`);
        return;
      }
      onUpdateMetadata({
        tempoText: validation.value,
        tempoBpm: validation.bpm,
        tempoUnit: validation.tempoUnit,
      });
      cancelEditing();
      return;
    }
  }, [editingField, draftValue, onUpdateMetadata, cancelEditing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const handleContainerKeyDown = (
    e: React.KeyboardEvent,
    field: EditableField,
    currentValue: string,
  ) => {
    if (editingField) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEditing(field, currentValue);
    }
  };

  const displayBpmText = tempoBpm ? `♩ = ${tempoBpm}` : tempoText;

  return (
    <div className="score-metadata-header" role="region" aria-label="Score metadata">
      {/* Title and Composer */}
      <div className="score-title-author-block">
        {/* Title */}
        <div className="metadata-field title-field">
          {editingField === 'title' ? (
            <div className="inline-edit-wrapper title-edit-wrapper">
              <span className="abc-tag-badge" title="ABC Title Header (T:)">T</span>
              <input
                ref={inputRef}
                type="text"
                className={`inline-edit-input title-input ${errorMessage ? 'has-error' : ''}`}
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setErrorMessage(null);
                }}
                onBlur={commitEditing}
                onKeyDown={handleKeyDown}
                aria-label="Edit score title"
              />
              {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
            </div>
          ) : (
            <div
              className="metadata-view-item title-view-item"
              onDoubleClick={() => startEditing('title', title)}
              onKeyDown={(e) => handleContainerKeyDown(e, 'title', title)}
              tabIndex={0}
              role="button"
              title="Double click to edit title (T:)"
              aria-label={`Score title: ${title}. Double click to edit.`}
            >
              <span className="abc-tag-badge" aria-hidden="true">T</span>
              <h1 className="score-title-text">{title}</h1>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="metadata-field composer-field">
          {editingField === 'composer' ? (
            <div className="inline-edit-wrapper composer-edit-wrapper">
              <span className="abc-tag-badge" title="ABC Composer Header (C:)">C</span>
              <input
                ref={inputRef}
                type="text"
                className={`inline-edit-input composer-input ${errorMessage ? 'has-error' : ''}`}
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setErrorMessage(null);
                }}
                onBlur={commitEditing}
                onKeyDown={handleKeyDown}
                aria-label="Edit score composer"
              />
              {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
            </div>
          ) : (
            <div
              className="metadata-view-item composer-view-item"
              onDoubleClick={() => startEditing('composer', composer === 'Unknown composer' ? '' : composer)}
              onKeyDown={(e) => handleContainerKeyDown(e, 'composer', composer === 'Unknown composer' ? '' : composer)}
              tabIndex={0}
              role="button"
              title="Double click to edit composer (C:)"
              aria-label={`Score composer: ${composer}. Double click to edit.`}
            >
              <span className="abc-tag-badge" aria-hidden="true">C</span>
              <p className="score-composer-text">{composer}</p>
            </div>
          )}
        </div>
      </div>

      {/* Metadata Chips: Key, Meter, Tempo, Voices */}
      <div className="score-metadata-chips" role="group" aria-label="Score musical attributes">
        {/* Key Signature */}
        <div className="metadata-chip-field">
          {editingField === 'key' ? (
            <div className="inline-edit-wrapper chip-edit-wrapper">
              <span className="abc-tag-badge">K</span>
              <input
                ref={inputRef}
                type="text"
                className={`inline-edit-input chip-input ${errorMessage ? 'has-error' : ''}`}
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setErrorMessage(null);
                }}
                onBlur={commitEditing}
                onKeyDown={handleKeyDown}
                placeholder="e.g. C, G, Am, Eb"
                aria-label="Edit key signature"
              />
              {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
            </div>
          ) : (
            <button
              type="button"
              className="metadata-chip"
              onDoubleClick={() => startEditing('key', keySignature)}
              onKeyDown={(e) => handleContainerKeyDown(e, 'key', keySignature)}
              title="Double click to edit key signature (K:)"
              aria-label={`Key signature: ${keySignature}. Double click to edit.`}
            >
              <span className="abc-tag-badge" aria-hidden="true">K</span>
              <span className="chip-label">Key:</span>
              <strong className="chip-value">{keySignature}</strong>
            </button>
          )}
        </div>

        {/* Meter / Time Signature */}
        <div className="metadata-chip-field">
          {editingField === 'meter' ? (
            <div className="inline-edit-wrapper chip-edit-wrapper">
              <span className="abc-tag-badge">M</span>
              <input
                ref={inputRef}
                type="text"
                className={`inline-edit-input chip-input ${errorMessage ? 'has-error' : ''}`}
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setErrorMessage(null);
                }}
                onBlur={commitEditing}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 4/4, 3/4, 6/8, C"
                aria-label="Edit time signature"
              />
              {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
            </div>
          ) : (
            <button
              type="button"
              className="metadata-chip"
              onDoubleClick={() => startEditing('meter', meter)}
              onKeyDown={(e) => handleContainerKeyDown(e, 'meter', meter)}
              title="Double click to edit time signature (M:)"
              aria-label={`Time signature: ${meter}. Double click to edit.`}
            >
              <span className="abc-tag-badge" aria-hidden="true">M</span>
              <span className="chip-label">Meter:</span>
              <strong className="chip-value">{meter}</strong>
            </button>
          )}
        </div>

        {/* Tempo */}
        <div className="metadata-chip-field">
          {editingField === 'tempo' ? (
            <div className="inline-edit-wrapper chip-edit-wrapper">
              <span className="abc-tag-badge">Q</span>
              <input
                ref={inputRef}
                type="text"
                className={`inline-edit-input chip-input ${errorMessage ? 'has-error' : ''}`}
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setErrorMessage(null);
                }}
                onBlur={commitEditing}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 120 or 1/4=120"
                aria-label="Edit tempo BPM"
              />
              {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
            </div>
          ) : (
            <button
              type="button"
              className="metadata-chip"
              onDoubleClick={() => startEditing('tempo', tempoBpm ? String(tempoBpm) : displayBpmText)}
              onKeyDown={(e) => handleContainerKeyDown(e, 'tempo', tempoBpm ? String(tempoBpm) : displayBpmText)}
              title="Double click to edit tempo (Q:)"
              aria-label={`Tempo: ${displayBpmText}. Double click to edit.`}
            >
              <span className="abc-tag-badge" aria-hidden="true">Q</span>
              <span className="chip-label">Tempo:</span>
              <strong className="chip-value">{displayBpmText}</strong>
            </button>
          )}
        </div>

        {/* Voices (informational badge) */}
        {voices.length > 0 && (
          <div className="metadata-chip-field voice-count-chip-field">
            <span
              className="metadata-chip readonly"
              title={`Score voices defined in ABC (V:): ${voices.join(', ')}`}
              aria-label={`Score has ${voices.length} voice${voices.length === 1 ? '' : 's'}: ${voices.join(', ')}`}
            >
              <span className="abc-tag-badge" aria-hidden="true">V</span>
              <span className="chip-label">Voices:</span>
              <strong className="chip-value">{voices.length}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoreMetadataHeader;
