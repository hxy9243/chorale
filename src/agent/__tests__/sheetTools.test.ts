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
    expect((range.details as any).measures[0]).toBe(snapshot.measureIndex.get(1));
    expect((range.details as any).measures[0].events).toBe(snapshot.eventIndex.get(1));
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

  it('exposes only read-only score and routing capabilities', () => {
    expect(createSheetTools(createSnapshot()).tools.map(({ name }) => name)).toEqual([
      'select_analysis_profile',
      'get_score_summary',
      'read_measure_range',
      'get_annotations',
    ]);
  });
});
