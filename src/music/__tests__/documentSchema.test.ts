import { describe, expect, it } from 'vitest';
import {
  normalizeAnnotation,
  normalizeFileDocument,
  validateAnnotation,
  validateAnnotationProposal,
} from '../documentSchema';

const baseAnnotation = {
  id: 'annotation-1',
  span: { startMeasure: 2, endMeasure: 4 },
  label: 'Dominant preparation',
  body: 'The harmony prepares the arrival.',
  source: 'assistant',
  agentProfiles: ['harmony', 'harmony', 'unknown'],
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};

describe('document schema normalization', () => {
  it('normalizes canonical range and chord annotations', () => {
    expect(normalizeAnnotation({ ...baseAnnotation, kind: 'modulation' })).toEqual({
      ...baseAnnotation,
      kind: 'modulation',
      agentProfiles: ['harmony'],
    });
    expect(normalizeAnnotation({
      ...baseAnnotation,
      kind: 'chord',
      position: { measure: 3, offset: { numerator: 2, denominator: 4 } },
      chordSymbol: 'G7',
    })).toBeNull();
    expect(normalizeAnnotation({
      ...baseAnnotation,
      kind: 'chord',
      position: { measure: 3, offset: { numerator: 1, denominator: 2 } },
      chordSymbol: 'G7',
      romanNumeral: 'V7',
    })).toMatchObject({
      kind: 'chord',
      position: { measure: 3, offset: { numerator: 1, denominator: 2 } },
      chordSymbol: 'G7',
      romanNumeral: 'V7',
    });
  });

  it('rejects invalid spans and chord positions outside their span', () => {
    expect(normalizeAnnotation({
      ...baseAnnotation,
      kind: 'explanation',
      span: { startMeasure: 0, endMeasure: 1 },
    })).toBeNull();
    expect(normalizeAnnotation({
      ...baseAnnotation,
      kind: 'chord',
      position: { measure: 5, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'C',
    })).toBeNull();
  });

  it('strictly validates canonical annotations without applying legacy migration', () => {
    expect(validateAnnotation({ ...baseAnnotation, kind: 'explanation' })).toMatchObject({
      kind: 'explanation',
      span: { startMeasure: 2, endMeasure: 4 },
    });
    expect(validateAnnotation({ ...baseAnnotation, kind: 'analysis' })).toBeNull();
    expect(validateAnnotation({ ...baseAnnotation, kind: 'harmony' })).toBeNull();
  });

  it('preserves distinct rational chord onsets within the same measure', () => {
    const annotations = [
      {
        ...baseAnnotation,
        id: 'chord-beat-1',
        kind: 'chord',
        span: { startMeasure: 3, endMeasure: 3 },
        position: { measure: 3, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'C',
      },
      {
        ...baseAnnotation,
        id: 'chord-beat-3',
        kind: 'chord',
        span: { startMeasure: 3, endMeasure: 3 },
        position: { measure: 3, offset: { numerator: 1, denominator: 2 } },
        chordSymbol: 'G7',
      },
    ];

    expect(annotations.map(validateAnnotation)).toMatchObject([
      { id: 'chord-beat-1', position: { measure: 3, offset: { numerator: 0, denominator: 1 } } },
      { id: 'chord-beat-3', position: { measure: 3, offset: { numerator: 1, denominator: 2 } } },
    ]);
  });

  it('validates proposal metadata around a canonical assistant annotation', () => {
    expect(validateAnnotationProposal({
      id: 'proposal-1',
      runId: 'run-1',
      documentId: 'document-1',
      sourceRevision: 3,
      state: 'proposed',
      annotation: { ...baseAnnotation, kind: 'explanation' },
    })).toMatchObject({
      id: 'proposal-1',
      sourceRevision: 3,
      annotation: { kind: 'explanation' },
    });
    expect(validateAnnotationProposal({
      id: 'proposal-1',
      runId: 'run-1',
      documentId: 'document-1',
      sourceRevision: 3,
      state: 'proposed',
      annotation: { ...baseAnnotation, kind: 'explanation', source: 'user' },
    })).toBeNull();
  });

  it('migrates legacy annotation kinds and anchor fields', () => {
    const legacyBase = {
      id: 'legacy-1',
      anchor: { measure: 3, endMeasure: 5 },
      label: 'Phrase note',
      body: 'A legacy analysis note.',
      source: 'assistant',
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    };

    for (const kind of ['analysis', 'phrase', 'comment', 'edit-note', 'fingering', 'future-kind']) {
      expect(normalizeAnnotation({ ...legacyBase, kind })).toMatchObject({
        kind: 'explanation',
        span: { startMeasure: 3, endMeasure: 5 },
      });
    }
  });

  it('recovers valid legacy harmony chords and otherwise keeps their explanation', () => {
    const legacyHarmony = {
      id: 'legacy-harmony',
      kind: 'harmony',
      measureStart: 2,
      measureEnd: 2,
      label: 'Dominant',
      description: 'A dominant chord.',
      source: 'assistant',
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    };

    expect(normalizeAnnotation(legacyHarmony)).toMatchObject({
      kind: 'explanation',
      span: { startMeasure: 2, endMeasure: 2 },
      body: 'A dominant chord.',
    });
    expect(normalizeAnnotation({
      ...legacyHarmony,
      chordSymbol: 'G7',
      position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
    })).toMatchObject({
      kind: 'chord',
      chordSymbol: 'G7',
      position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
    });
  });

  it('normalizes a complete persisted document without mutating its input', () => {
    const input = {
      id: 'doc-1',
      name: 'score.abc',
      sourceType: 'abc',
      abcSource: 'X:1\nK:C\nC|',
      revision: 1,
      scoreInfo: { title: 'Score', measures: 1, ignored: true },
      annotations: [{ ...baseAnnotation, kind: 'explanation' }],
      chats: [{
        id: 'chat-1',
        title: 'Harmony',
        messageCount: 2,
        updatedAt: '2026-08-05T00:00:00.000Z',
      }],
      versions: [{
        revision: 1,
        abcSource: 'X:1\nK:C\nC|',
        createdAt: '2026-08-05T00:00:00.000Z',
        reason: 'import',
      }],
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };

    const normalized = normalizeFileDocument(input);

    expect(normalized).toMatchObject({
      id: 'doc-1',
      scoreInfo: { title: 'Score', measures: 1 },
      annotations: [{ kind: 'explanation' }],
    });
    expect(normalized).not.toBe(input);
    expect(input.scoreInfo.ignored).toBe(true);
  });

  it('rejects documents without valid core identity and defaults optional collections', () => {
    expect(normalizeFileDocument({ id: '', sourceType: 'abc' })).toBeNull();
    expect(normalizeFileDocument({
      id: 'doc-2',
      name: 'empty.abc',
      sourceType: 'abc',
      abcSource: '',
      revision: 1,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    })).toMatchObject({ annotations: [], chats: [], versions: [] });
  });
});
