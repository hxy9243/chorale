import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../types/document';
import { createMusicContextSnapshot } from '../musicContext';

describe('music context capture', () => {
  it('deep-copies and freezes selection and canonical annotations', () => {
    const selection = { startMeasure: 2, endMeasure: 4 };
    const annotations: Annotation[] = [{
      id: 'chord-1',
      kind: 'chord',
      span: { startMeasure: 2, endMeasure: 2 },
      position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
      chordSymbol: 'G7',
      label: 'Dominant',
      body: 'Resolves onward.',
      source: 'assistant',
      agentProfiles: ['harmony'],
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }];
    const snapshot = createMusicContextSnapshot({
      id: 'snapshot-1',
      documentId: 'document-1',
      revision: 3,
      capturedAt: '2026-08-05T00:00:00.000Z',
      fileName: 'score.abc',
      abc: 'X:1\nK:C\nC|',
      selection,
      annotations,
    });
    selection.startMeasure = 1;
    annotations[0].label = 'Changed later';

    expect(snapshot.selection).toEqual({ startMeasure: 2, endMeasure: 4 });
    expect(snapshot.annotations[0].label).toBe('Dominant');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.selection)).toBe(true);
    expect(Object.isFrozen(snapshot.annotations)).toBe(true);
    expect(Object.isFrozen(snapshot.annotations[0].span)).toBe(true);
    expect(Object.isFrozen((snapshot.annotations[0] as Extract<Annotation, { kind: 'chord' }>).position.offset))
      .toBe(true);
  });
});
