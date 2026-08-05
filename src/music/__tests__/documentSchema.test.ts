import { describe, expect, it } from 'vitest';
import { normalizeAnnotation, normalizeFileDocument } from '../documentSchema';

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
