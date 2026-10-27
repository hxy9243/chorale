import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackgroundScoreImports } from '../useBackgroundScoreImports';
import type { ScoreImportJob, ScoreScanBridge, ScoreScanResult } from '../../types/scoreScan';
import type { FileDocument } from '../../types/document';
import { prepareScanImport } from '../../utils/prepareScanImport';

vi.mock('../../utils/prepareScanImport', () => ({ prepareScanImport: vi.fn(() => ({ title: 'Piano', abc: 'X:1\nK:C\nC|' })), scanImportError: (error: Error) => error.message }));
const job: ScoreImportJob = { id: '00000000-0000-4000-8000-000000000000', title: 'Piano', sourceName: 'Piano.pdf', engine: 'copisteria', pages: [1, 2, 3, 4, 5, 6, 7], state: 'recognized', createdAt: new Date().toISOString(), sourceAvailable: true };
const setup = () => {
  const jobs = [job];
  const bridge: ScoreScanBridge = { status: vi.fn(), scan: vi.fn(), start: vi.fn().mockResolvedValue({ ...job, state: 'importing' }), listJobs: vi.fn(async () => [...jobs]),
    result: vi.fn().mockResolvedValue({ jobId: job.id }), fail: vi.fn(), dismiss: vi.fn(async () => { jobs.splice(0); }), cancel: vi.fn(), openSourceFolder: vi.fn() };
  window.choraleScan = bridge;
  const options = { documents: [] as FileDocument[], persistedDocumentIds: new Set<string>(), hydrationStatus: 'ready', createDocument: vi.fn().mockReturnValue(job.id), selectDocument: vi.fn() };
  return { bridge, options, ...renderHook((props) => useBackgroundScoreImports(props), { initialProps: options }) };
};
beforeEach(() => { sessionStorage.clear(); vi.mocked(prepareScanImport).mockReturnValue({ title: 'Piano', abc: 'X:1\nK:C\nC|' }); });
afterEach(() => { cleanup(); delete window.choraleScan; vi.restoreAllMocks(); });
describe('background score import lifecycle', () => {
  it('creates one stable score without stealing focus and dismisses only after saving', async () => {
    const { result, bridge, options, rerender } = setup();
    await waitFor(() => expect(options.createDocument).toHaveBeenCalledWith(expect.any(String), 'Piano', { id: job.id, activate: false }));
    expect(bridge.dismiss).not.toHaveBeenCalled();
    const documents = [{ id: job.id } as FileDocument];
    rerender({ ...options, documents });
    await new Promise((done) => setTimeout(done, 1100));
    expect(bridge.dismiss).not.toHaveBeenCalled();
    expect(options.createDocument).toHaveBeenCalledOnce();
    rerender({ ...options, documents, persistedDocumentIds: new Set([job.id]) });
    await waitFor(() => expect(bridge.dismiss).toHaveBeenCalledWith(job.id), { timeout: 2500 });
    expect(result.current.jobs).toHaveLength(0);
  });
  it('reattaches a selected job after renderer reload and activates its completed score', async () => {
    sessionStorage.setItem('chorale.scan.selectedImport', job.id);
    const { options, result } = setup();
    await waitFor(() => expect(options.createDocument).toHaveBeenCalledWith(expect.any(String), 'Piano', { id: job.id, activate: true }));
    expect(result.current.activeJob).toBeUndefined();
    expect(sessionStorage.getItem('chorale.scan.selectedImport')).toBeNull();
  });
  it('does not duplicate a score already present when reattaching', async () => {
    const { options, rerender, bridge } = setup();
    rerender({ ...options, hydrationStatus: 'hydrating' });
    await act(async () => { await Promise.resolve(); });
    options.createDocument.mockClear();
    rerender({ ...options, documents: [{ id: job.id } as FileDocument], persistedDocumentIds: new Set([job.id]) });
    await waitFor(() => expect(bridge.dismiss).toHaveBeenCalled(), { timeout: 2500 });
    expect(options.createDocument).not.toHaveBeenCalled();
  });
  it('turns conversion errors into failed entries without creating a score', async () => {
    vi.mocked(prepareScanImport).mockImplementationOnce(() => { throw new Error('Original and MusicXML preserved.'); });
    const { options, result, bridge } = setup();
    await waitFor(() => expect(bridge.fail).toHaveBeenCalledWith(job.id, 'Original and MusicXML preserved.'));
    expect(options.createDocument).not.toHaveBeenCalled();
    expect(result.current.jobs[0].state).toBe('failed');
  });
  it('ignores a late result after cancel and never cancels recognition on unmount', async () => {
    const { bridge, result, options, unmount } = setup();
    let finish!: (data: ScoreScanResult) => void;
    vi.mocked(bridge.result).mockImplementation(() => new Promise((done) => { finish = done; }));
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => { await result.current.cancel(job.id); finish({ jobId: job.id } as ScoreScanResult); });
    expect(options.createDocument).not.toHaveBeenCalled();
    expect(bridge.fail).not.toHaveBeenCalled();
    expect(bridge.cancel).toHaveBeenCalledOnce();
    unmount();
    expect(bridge.cancel).toHaveBeenCalledOnce();
  });
  it('keeps native work alive when a renderer disappears during conversion', async () => {
    const { bridge, options, unmount } = setup();
    let finish!: (data: ScoreScanResult) => void;
    vi.mocked(bridge.result).mockImplementation(() => new Promise((done) => { finish = done; }));
    await waitFor(() => expect(finish).toBeDefined());
    unmount(); finish({ jobId: job.id } as ScoreScanResult);
    await Promise.resolve();
    expect(options.createDocument).not.toHaveBeenCalled(); expect(bridge.cancel).not.toHaveBeenCalled(); expect(bridge.dismiss).not.toHaveBeenCalled();
  });
});
