// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createScoreSnapshot } from '../../music/scoreSnapshot';
import { createSheetTools } from '../../../electron/ai/sheetTools';

describe('desktop music21 tool', () => {
  it('requires a passage read and uses the immutable captured score revision', async () => {
    const abc = 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F |]';
    const snapshot = createScoreSnapshot({ snapshotId: 'test', documentId: 'score', revision: 4, abc, annotations: [] });
    const analyzeMusic21 = vi.fn().mockResolvedValue({ result: { checked: true } });
    const registry = createSheetTools(snapshot, { analyzeMusic21 });
    const call = (name: string, args: unknown) => registry.tools.find(tool => tool.name === name)!.execute('test-call', args as never);
    await call('select_analysis_profile', { profiles: ['harmony'] });
    const args = { startMeasure: 1, endMeasure: 1, code: 'result = len(events)' };
    await expect(call('analyze_music21', args)).rejects.toThrow('Read every analyzed measure');
    expect(analyzeMusic21).not.toHaveBeenCalled();
    await call('read_measure_range', { startMeasure: 1, endMeasure: 1 });
    await call('analyze_music21', args);
    expect(analyzeMusic21).toHaveBeenCalledWith({ ...args, abcSource: abc, documentId: 'score', revision: 4 }, { signal: undefined });
    expect(snapshot.abc).toBe(abc);
  });
});
