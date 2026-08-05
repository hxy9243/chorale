import { describe, expect, it } from 'vitest';
import type { Annotation, AnnotationProposal } from '../../types/document';
import {
  editAnnotationProposal,
  markOutdatedProposals,
  prepareApplyAll,
  rejectAnnotationProposal,
} from '../proposalActions';

const timestamp = '2026-08-05T00:00:00.000Z';
const annotation = (id: string, body = 'Explanation.'): Annotation => ({
  id,
  kind: 'explanation',
  span: { startMeasure: 1, endMeasure: 2 },
  label: 'Phrase',
  body,
  source: 'assistant',
  createdAt: timestamp,
  updatedAt: timestamp,
});
const proposal = (
  id: string,
  state: AnnotationProposal['state'] = 'proposed',
): AnnotationProposal => ({
  id,
  runId: 'run-1',
  documentId: 'document-1',
  sourceRevision: 3,
  state,
  annotation: annotation(`annotation-${id}`),
});

describe('proposal review actions', () => {
  it('edits staged content while preserving application-controlled identity metadata', () => {
    const [edited] = editAnnotationProposal(
      [proposal('one')],
      'one',
      {
        ...annotation('model-id', 'Edited explanation.'),
        source: 'user',
        createdAt: 'model-time',
      },
      '2026-08-05T01:00:00.000Z',
    );

    expect(edited.state).toBe('proposed');
    expect(edited.annotation).toMatchObject({
      id: 'annotation-one',
      source: 'assistant',
      body: 'Edited explanation.',
      createdAt: timestamp,
      updatedAt: '2026-08-05T01:00:00.000Z',
    });
  });

  it('rejects one proposal without affecting the remaining staged proposal', () => {
    expect(rejectAnnotationProposal([proposal('one'), proposal('two')], 'one'))
      .toMatchObject([{ id: 'one', state: 'rejected' }, { id: 'two', state: 'proposed' }]);
  });

  it('marks revision or document mismatches outdated and prepares no annotations', () => {
    expect(markOutdatedProposals([proposal('one')], 'document-1', 4)[0].state).toBe('outdated');
    const result = prepareApplyAll([proposal('one')], 'other-document', 3);
    expect(result).toMatchObject({
      status: 'outdated',
      annotations: [],
      proposals: [{ id: 'one', state: 'outdated' }],
    });
  });

  it('returns an empty no-op for no eligible proposals and repeated application', () => {
    expect(prepareApplyAll([
      proposal('rejected', 'rejected'),
      proposal('unavailable', 'unavailable'),
    ], 'document-1', 3).status).toBe('empty');

    const first = prepareApplyAll([proposal('one')], 'document-1', 3);
    expect(first.status).toBe('ready');
    expect(first.proposals[0].state).toBe('accepted');
    expect(prepareApplyAll(first.proposals, 'document-1', 3).status).toBe('empty');
  });

  it('excludes rejected proposals and applies edited proposed annotations together', () => {
    const rejected = rejectAnnotationProposal([proposal('one'), proposal('two')], 'one');
    const edited = editAnnotationProposal(
      rejected,
      'two',
      annotation('ignored', 'Edited body.'),
      '2026-08-05T02:00:00.000Z',
    );
    const result = prepareApplyAll(edited, 'document-1', 3);

    expect(result.status).toBe('ready');
    expect(result.annotations).toMatchObject([{ id: 'annotation-two', body: 'Edited body.' }]);
    expect(result.proposals).toMatchObject([
      { id: 'one', state: 'rejected' },
      { id: 'two', state: 'accepted' },
    ]);
  });

  it('identifies every invalid proposal and applies none', () => {
    const invalid = {
      ...proposal('invalid'),
      annotation: { ...annotation('annotation-invalid'), span: { startMeasure: 0, endMeasure: 1 } },
    } as AnnotationProposal;
    const result = prepareApplyAll(
      [proposal('valid'), invalid],
      'document-1',
      3,
      new Set(['unrelated-existing']),
    );

    expect(result).toMatchObject({
      status: 'invalid',
      annotations: [],
      invalidProposalIds: ['invalid'],
      proposals: [{ id: 'valid', state: 'proposed' }, { id: 'invalid', state: 'proposed' }],
    });
  });

  it('treats existing and intra-batch annotation ID collisions as all-or-none failures', () => {
    const duplicate = {
      ...proposal('two'),
      annotation: annotation('annotation-one'),
    };
    const existing = prepareApplyAll(
      [proposal('one')],
      'document-1',
      3,
      new Set(['annotation-one']),
    );
    const withinBatch = prepareApplyAll([proposal('one'), duplicate], 'document-1', 3);

    expect(existing).toMatchObject({ status: 'invalid', annotations: [] });
    expect(withinBatch).toMatchObject({
      status: 'invalid',
      annotations: [],
      invalidProposalIds: ['two'],
    });
  });
});
