import { describe, expectTypeOf, it } from 'vitest';
import type {
  Annotation,
  AnnotationProposal,
  ChordAnnotation,
  MeasureSpan,
  MusicalPosition,
  ProposalState,
  RationalDuration,
  ScoreAnchor,
} from '../document';

describe('shared musical document contracts', () => {
  it('uses exact rational offsets for musical positions', () => {
    expectTypeOf<MusicalPosition>().toEqualTypeOf<{
      measure: number;
      offset: RationalDuration;
    }>();
  });

  it('shares inclusive measure bounds with score anchors', () => {
    expectTypeOf<ScoreAnchor>().toMatchTypeOf<MeasureSpan>();
    expectTypeOf<MeasureSpan>().toEqualTypeOf<{
      startMeasure: number;
      endMeasure: number;
    }>();
  });

  it('requires musical position and symbol only for chord annotations', () => {
    const chord: ChordAnnotation = {
      id: 'annotation-1',
      kind: 'chord',
      span: { startMeasure: 2, endMeasure: 2 },
      position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
      chordSymbol: 'G7',
      romanNumeral: 'V7/V',
      label: 'Secondary dominant',
      body: 'Resolves to the dominant.',
      source: 'assistant',
      agentProfiles: ['harmony'],
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    const explanation: Annotation = {
      id: 'annotation-2',
      kind: 'explanation',
      span: { startMeasure: 2, endMeasure: 4 },
      label: 'Sequence',
      body: 'This idea repeats across the passage.',
      source: 'user',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };

    expectTypeOf(chord).toMatchTypeOf<Annotation>();
    expectTypeOf(chord.position).toEqualTypeOf<MusicalPosition>();
    expectTypeOf(explanation).toMatchTypeOf<Annotation>();
  });

  it('tracks proposal identity, source revision, state, and canonical annotation', () => {
    expectTypeOf<ProposalState>().toEqualTypeOf<
      'proposed' | 'accepted' | 'rejected' | 'outdated' | 'unavailable'
    >();
    expectTypeOf<AnnotationProposal>().toMatchTypeOf<{
      id: string;
      runId: string;
      documentId: string;
      sourceRevision: number;
      state: ProposalState;
      annotation: Annotation;
    }>();
  });
});
