// @vitest-environment node
import abcjs from 'abcjs';
import { describe, expect, it, vi } from 'vitest';
import { createScoreSnapshot } from '../../music/scoreSnapshot';
import {
  createSheetTools,
  SheetToolValidationError,
} from '../../../electron/ai/sheetTools';

const createSnapshot = () => createScoreSnapshot({
  snapshotId: 'snapshot-tools',
  documentId: 'document-tools',
  revision: 2,
  abc: 'X:1\nT:Tool score\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]',
  annotations: [{
    id: 'annotation-tools',
    kind: 'explanation',
    span: { startMeasure: 1, endMeasure: 2 },
    label: 'Opening',
    body: 'Opening passage.',
    source: 'assistant',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }],
});

describe('sheet tools', () => {
  it('requires and supports multiple analysis profiles before score reads', async () => {
    const routed = vi.fn();
    const registry = createSheetTools(createSnapshot(), { onProfileRoute: routed });
    const read = registry.tools.find(({ name }) => name === 'read_measure_range')!;
    await expect(read.execute('read-before-route', { startMeasure: 1, endMeasure: 1 }))
      .rejects.toMatchObject({ code: 'profile_required' });

    const route = registry.tools.find(({ name }) => name === 'select_analysis_profile')!;
    const result = await route.execute('route-1', {
      profiles: ['harmony', 'voice-leading'],
    });

    expect(registry.state.selectedProfiles).toEqual(['harmony', 'voice-leading']);
    expect(routed).toHaveBeenCalledWith(['harmony', 'voice-leading']);
    expect(result.details).toMatchObject({
      profiles: [{ id: 'harmony' }, { id: 'voice-leading' }],
    });
  });

  it('reads summary, range, and annotations from the same snapshot indexes', async () => {
    const parseOnly = vi.spyOn(abcjs, 'parseOnly');
    const snapshot = createSnapshot();
    const registry = createSheetTools(snapshot);
    await registry.tools[0].execute('route-1', { profiles: ['general'] });

    const summary = await registry.tools[1].execute('summary-1', {});
    const range = await registry.tools[2].execute('range-1', {
      startMeasure: 1,
      endMeasure: 2,
    });
    const annotations = await registry.tools[3].execute('annotations-1', {
      startMeasure: 2,
      endMeasure: 2,
      kinds: ['explanation'],
    });

    expect(summary.details).toMatchObject({ totalMeasures: 2, voices: ['voice-1'] });
    expect((range.details as any).measures[0]).toMatchObject({
      measureNumber: 1,
      abcSlice: snapshot.measureIndex.get(1)?.abcSlice,
    });
    expect((range.details as any).measures).toHaveLength(2);
    for (const measure of (range.details as any).measures) {
      expect(measure.abcRange).toBeUndefined();
      expect(measure.events).toBeUndefined();
    }
    const serializedRange = JSON.parse((range.content[0] as { text: string }).text);
    expect(serializedRange).toEqual(range.details);
    expect((range.content[0] as { text: string }).text).not.toContain('abcRange');
    expect((range.content[0] as { text: string }).text).not.toContain('events');
    expect(annotations.details).toEqual({ annotations: [snapshot.annotations[0]] });
    expect(parseOnly).toHaveBeenCalledTimes(1);
  });

  it('returns compact structured validation errors for unsafe ranges', async () => {
    const registry = createSheetTools(createSnapshot());
    await registry.tools[0].execute('route-1', { profiles: ['harmony'] });
    const read = registry.tools[2];

    await expect(read.execute('reverse', { startMeasure: 2, endMeasure: 1 }))
      .rejects.toMatchObject({ code: 'invalid_range' });
    await expect(read.execute('too-large', { startMeasure: 1, endMeasure: 33 }))
      .rejects.toMatchObject({ code: 'range_too_large' });
    await expect(read.execute('outside', { startMeasure: 2, endMeasure: 3 }))
      .rejects.toMatchObject({ code: 'measure_not_found' });
    try {
      await read.execute('outside-details', { startMeasure: 3, endMeasure: 3 });
    } catch (error) {
      expect(error).toBeInstanceOf(SheetToolValidationError);
      expect(JSON.parse((error as Error).message)).toEqual({
        error: {
          code: 'measure_not_found',
          message: 'Requested measure is outside the score.',
          details: { measure: 3, totalMeasures: 2 },
        },
      });
    }
  });

  it('creates canonical proposals with server-controlled metadata without mutating the snapshot', async () => {
    const created = vi.fn();
    const ids = ['annotation-1', 'proposal-1', 'annotation-2', 'proposal-2'];
    const snapshot = createSnapshot();
    const registry = createSheetTools(snapshot, {
      runId: 'run-tools',
      createId: () => ids.shift()!,
      now: () => '2026-08-05T03:00:00.000Z',
      onProposalCreated: created,
    });
    await registry.tools[0].execute('route', { profiles: ['harmony'] });
    const result = await registry.tools[4].execute('propose', {
      annotations: [{
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 1, denominator: 2 } },
        chordSymbol: 'G7',
        romanNumeral: 'V7',
        label: 'Dominant',
        body: 'The dominant prepares the next measure.',
        id: 'model-id-is-ignored',
        source: 'user',
      }, {
        kind: 'explanation',
        span: { startMeasure: 1, endMeasure: 2 },
        label: 'Phrase',
        body: 'The two measures form a short phrase.',
      }],
    } as any);

    expect(result.details).toEqual({
      proposedCount: 2,
      proposalIds: ['proposal-1', 'proposal-2'],
    });
    expect(created).toHaveBeenNthCalledWith(1, {
      id: 'proposal-1',
      runId: 'run-tools',
      documentId: 'document-tools',
      sourceRevision: 2,
      state: 'proposed',
      annotation: {
        id: 'annotation-1',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 1, denominator: 2 } },
        chordSymbol: 'G7',
        romanNumeral: 'V7',
        label: 'Dominant',
        body: 'The dominant prepares the next measure.',
        source: 'assistant',
        agentProfiles: ['harmony'],
        createdAt: '2026-08-05T03:00:00.000Z',
        updatedAt: '2026-08-05T03:00:00.000Z',
      },
    });
    expect(registry.state.proposedCount).toBe(2);
    expect(snapshot.annotations).toHaveLength(1);
  });

  it('rejects invalid or over-limit proposal batches before emitting any proposal', async () => {
    const created = vi.fn();
    const registry = createSheetTools(createSnapshot(), { onProposalCreated: created });
    await registry.tools[0].execute('route', { profiles: ['harmony'] });
    const propose = registry.tools[4];
    const explanation = (index: number) => ({
      kind: 'explanation' as const,
      span: { startMeasure: 1, endMeasure: 1 },
      label: `Label ${index}`,
      body: `Body ${index}`,
    });

    await expect(propose.execute('invalid', {
      annotations: [{
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 2, denominator: 4 } },
        chordSymbol: 'C',
        label: 'Invalid rational',
        body: 'This is not reduced.',
      }],
    })).rejects.toMatchObject({ code: 'invalid_proposals' });
    expect(created).not.toHaveBeenCalled();

    await propose.execute('first-batch', {
      annotations: Array.from({ length: 31 }, (_, index) => explanation(index)),
    });
    await expect(propose.execute('over-limit', {
      annotations: [explanation(31), explanation(32)],
    })).rejects.toMatchObject({ code: 'proposal_limit' });
    expect(created).toHaveBeenCalledTimes(31);
  });

  it('exposes read-only score, routing, and non-mutating proposal capabilities', () => {
    expect(createSheetTools(createSnapshot()).tools.map(({ name }) => name)).toEqual([
      'select_analysis_profile',
      'get_score_summary',
      'read_measure_range',
      'get_annotations',
      'propose_annotations',
    ]);
  });
});
