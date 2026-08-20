import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ScoreMetadata,
  validateKeySignature,
  validateMeter,
  validateTempo,
  MIN_TEMPO_BPM,
  MAX_TEMPO_BPM,
} from '../utils/abcMetadata';

export interface ScoreMetadataHeaderProps {
  title?: string;
  subtitle?: string;
  composer?: string;
  author?: string;
  rhythm?: string;
  origin?: string;
  keySignature?: string;
  meter?: string;
  tempoText?: string;
  tempoBpm?: number;
  onUpdateMetadata: (updates: Partial<ScoreMetadata>) => void;
  disabled?: boolean;
}

type EditableField =
  | 'title'
  | 'subtitle'
  | 'composer'
  | 'author'
  | 'rhythm'
  | 'origin'
  | 'key'
  | 'meter'
  | 'tempo';

export const ScoreMetadataHeader: React.FC<ScoreMetadataHeaderProps> = ({
  title = 'Untitled score',
  subtitle,
  composer = 'Unknown composer',
  author,
  rhythm,
  origin,
  keySignature = 'C',
  meter = '4/4',
  tempoText = '♩ = 120',
  tempoBpm,
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

    if (editingField === 'subtitle') {
      onUpdateMetadata({ subtitle: trimmed });
      cancelEditing();
      return;
    }

    if (editingField === 'author') {
      onUpdateMetadata({ author: trimmed });
      cancelEditing();
      return;
    }

    if (editingField === 'composer') {
      onUpdateMetadata({ composer: trimmed });
      cancelEditing();
      return;
    }

    if (editingField === 'rhythm') {
      onUpdateMetadata({ rhythm: trimmed });
      cancelEditing();
      return;
    }

    if (editingField === 'origin') {
      onUpdateMetadata({ origin: trimmed });
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
      {/* 1. Center Aligned Title */}
      <div className="metadata-field score-title-field">
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
            <h1 className="score-title-text">{title}</h1>
          </div>
        )}
      </div>

      {/* 2. Taglines and Composer block: right-aligned with measure render width */}
      <div className="score-header-taglines-block">
        {/* Tagline / Subtitle */}
        {subtitle && (
          <div className="metadata-field score-subtitle-field">
            {editingField === 'subtitle' ? (
              <div className="inline-edit-wrapper subtitle-edit-wrapper">
                <span className="abc-tag-badge" title="ABC Subtitle Header (T:)">T</span>
                <input
                  ref={inputRef}
                  type="text"
                  className={`inline-edit-input subtitle-input ${errorMessage ? 'has-error' : ''}`}
                  value={draftValue}
                  onChange={(e) => {
                    setDraftValue(e.target.value);
                    setErrorMessage(null);
                  }}
                  onBlur={commitEditing}
                  onKeyDown={handleKeyDown}
                  aria-label="Edit score subtitle"
                />
                {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
              </div>
            ) : (
              <div
                className="metadata-view-item subtitle-view-item"
                onDoubleClick={() => startEditing('subtitle', subtitle)}
                onKeyDown={(e) => handleContainerKeyDown(e, 'subtitle', subtitle)}
                tabIndex={0}
                role="button"
                title="Double click to edit subtitle"
                aria-label={`Score subtitle: ${subtitle}. Double click to edit.`}
              >
                <p className="score-subtitle-text">{subtitle}</p>
              </div>
            )}
          </div>
        )}

        {/* Origin (O:) */}
        {origin && (
          <div className="metadata-field score-tagline-field">
            {editingField === 'origin' ? (
              <div className="inline-edit-wrapper tagline-edit-wrapper">
                <span className="abc-tag-badge" title="ABC Origin Header (O:)">O</span>
                <input
                  ref={inputRef}
                  type="text"
                  className={`inline-edit-input tagline-input ${errorMessage ? 'has-error' : ''}`}
                  value={draftValue}
                  onChange={(e) => {
                    setDraftValue(e.target.value);
                    setErrorMessage(null);
                  }}
                  onBlur={commitEditing}
                  onKeyDown={handleKeyDown}
                  aria-label="Edit score origin"
                />
                {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
              </div>
            ) : (
              <div
                className="metadata-view-item tagline-view-item"
                onDoubleClick={() => startEditing('origin', origin)}
                onKeyDown={(e) => handleContainerKeyDown(e, 'origin', origin)}
                tabIndex={0}
                role="button"
                title="Double click to edit origin (O:)"
                aria-label={`Score origin: ${origin}. Double click to edit.`}
              >
                <span className="score-tagline-text">{origin}</span>
              </div>
            )}
          </div>
        )}

        {/* Rhythm (R:) */}
        {rhythm && (
          <div className="metadata-field score-tagline-field">
            {editingField === 'rhythm' ? (
              <div className="inline-edit-wrapper tagline-edit-wrapper">
                <span className="abc-tag-badge" title="ABC Rhythm Header (R:)">R</span>
                <input
                  ref={inputRef}
                  type="text"
                  className={`inline-edit-input tagline-input ${errorMessage ? 'has-error' : ''}`}
                  value={draftValue}
                  onChange={(e) => {
                    setDraftValue(e.target.value);
                    setErrorMessage(null);
                  }}
                  onBlur={commitEditing}
                  onKeyDown={handleKeyDown}
                  aria-label="Edit score rhythm"
                />
                {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
              </div>
            ) : (
              <div
                className="metadata-view-item tagline-view-item"
                onDoubleClick={() => startEditing('rhythm', rhythm)}
                onKeyDown={(e) => handleContainerKeyDown(e, 'rhythm', rhythm)}
                tabIndex={0}
                role="button"
                title="Double click to edit rhythm (R:)"
                aria-label={`Score rhythm: ${rhythm}. Double click to edit.`}
              >
                <span className="score-tagline-text">{rhythm}</span>
              </div>
            )}
          </div>
        )}

        {/* Lyricist / Author (A:) */}
        {author && (
          <div className="metadata-field score-author-field">
            {editingField === 'author' ? (
              <div className="inline-edit-wrapper author-edit-wrapper">
                <span className="abc-tag-badge" title="ABC Lyricist/Author Header (A:)">A</span>
                <input
                  ref={inputRef}
                  type="text"
                  className={`inline-edit-input author-input ${errorMessage ? 'has-error' : ''}`}
                  value={draftValue}
                  onChange={(e) => {
                    setDraftValue(e.target.value);
                    setErrorMessage(null);
                  }}
                  onBlur={commitEditing}
                  onKeyDown={handleKeyDown}
                  aria-label="Edit score lyricist/author"
                />
                {errorMessage && <span className="edit-error-tooltip" role="alert">{errorMessage}</span>}
              </div>
            ) : (
              <div
                className="metadata-view-item author-view-item"
                onDoubleClick={() => startEditing('author', author)}
                onKeyDown={(e) => handleContainerKeyDown(e, 'author', author)}
                tabIndex={0}
                role="button"
                title="Double click to edit lyricist/author (A:)"
                aria-label={`Score lyricist/author: ${author}. Double click to edit.`}
              >
                <p className="score-author-text">{author}</p>
              </div>
            )}
          </div>
        )}

        {/* Composer (C:) */}
        <div className="metadata-field score-composer-field">
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
              <p className="score-composer-text">{composer}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Centered Metadata Chips: Key, Meter, Tempo (lower down) */}
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
              <span className="chip-label">Tempo:</span>
              <strong className="chip-value">{displayBpmText}</strong>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScoreMetadataHeader;
