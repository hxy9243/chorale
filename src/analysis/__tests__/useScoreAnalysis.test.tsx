import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScoreAnalysis } from '../useScoreAnalysis';
import { musicalAnalysisKey } from '../scoreAnalysis';
import type { AnalysisState } from '../types';
import type { FileDocument } from '../../types/document';
import type { ChoraleAIBridge } from '../../agent/aiTypes';

const abc = 'X:1\nT:Study\nM:4/4\nL:1/4\nK:C\nC4 | D4 | E4 | F4 |]';
const document = { id: 'score-1', revision: 1, abcSource: abc, name: 'Study', annotations: [] } as unknown as FileDocument;
const selection = { connectionId: 'provider', modelId: 'model' };
const setup = () => {
  vi.useFakeTimers();
  let state: AnalysisState = { documentId: 'score-1', preferences: { lenses: [], autoRefresh: true }, status: 'idle', totalMeasures: 4, completedMeasures: 0 };
  const request = vi.fn(async () => { state = { ...state, status: 'current', completedMeasures: 4 }; return state; });
  const bridge = {
    getAnalysis: vi.fn(async () => state), stopAnalysis: vi.fn(async () => {}), requestAnalysis: request,
    observeAnalysis: vi.fn(async context => { const fingerprint = musicalAnalysisKey(context.abc); if (fingerprint !== state.fingerprint) state = { ...state, fingerprint, status: 'idle', completedMeasures: 0 }; return state; }),
    setAnalysisPreferences: vi.fn(async (_id, preferences) => { state = { ...state, preferences, status: 'idle' }; return state; }),
  } as unknown as ChoraleAIBridge;
  window.choraleAI = bridge;
  return { request, bridge };
};
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
afterEach(() => { delete window.choraleAI; vi.useRealTimers(); });

describe('automatic analysis scheduling', () => {
  it('does not overwrite saved preferences while the first load is pending', async () => {
    const { bridge } = setup();
    let release!: (state: AnalysisState) => void;
    vi.mocked(bridge.getAnalysis!).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const view = renderHook(() => useScoreAnalysis(document, true, selection));
    expect(view.result.current.ready).toBe(false);
    act(() => view.result.current.updatePreferences({ lenses: ['chords'], autoRefresh: true }));
    expect(bridge.setAnalysisPreferences).not.toHaveBeenCalled();
    await act(async () => { release({ documentId: 'score-1', preferences: { lenses: ['modulation'], autoRefresh: false }, status: 'idle', totalMeasures: 4, completedMeasures: 0 }); });
    expect(view.result.current.ready).toBe(true); expect(view.result.current.preferences.lenses).toEqual(['modulation']);
    view.unmount();
  });
  it('starts an enabled lens, coalesces edits, and does not rerun after annotation or title edits', async () => {
    const { request } = setup();
    const view = renderHook(({ doc }) => useScoreAnalysis(doc, true, selection), { initialProps: { doc: document } });
    await advance(0); act(() => view.result.current.updatePreferences({ lenses: ['chords'], autoRefresh: true }));
    await advance(400); expect(request).toHaveBeenCalledTimes(1);
    view.rerender({ doc: { ...document, revision: 2, abcSource: abc.replace('C4', 'G4') } }); await advance(700);
    view.rerender({ doc: { ...document, revision: 3, abcSource: abc.replace('C4', 'A4') } }); await advance(700);
    expect(request).toHaveBeenCalledTimes(1); await advance(900); expect(request).toHaveBeenCalledTimes(2);
    view.rerender({ doc: { ...document, revision: 4, abcSource: abc.replace('C4', 'A4').replace('T:Study','T:Renamed') } });
    await advance(2000); expect(request).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it('keeps lens activation manual when refresh after edits is off', async () => {
    const { request } = setup();
    const view = renderHook(({ doc }) => useScoreAnalysis(doc, true, selection), { initialProps: { doc: document } });
    await advance(0); act(() => view.result.current.updatePreferences({ lenses: ['chords'], autoRefresh: false }));
    await advance(400); expect(request).toHaveBeenCalledTimes(1);
    view.rerender({ doc: { ...document, revision: 2, abcSource: abc.replace('C4', 'A4') } }); await advance(2000);
    expect(request).toHaveBeenCalledTimes(1); await act(async () => view.result.current.refresh()); expect(request).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it('remembers a requested lens and starts it after a default model is configured', async () => {
    const { request } = setup();
    const view = renderHook(({ selected }) => useScoreAnalysis(document, true, selected), { initialProps: { selected: null as typeof selection | null } });
    await advance(0); act(() => view.result.current.updatePreferences({ lenses: ['chords'], autoRefresh: true }));
    await advance(1000); expect(request).not.toHaveBeenCalled(); view.rerender({ selected: selection });
    await advance(400); expect(request).toHaveBeenCalledTimes(1); view.unmount();
  });
});
