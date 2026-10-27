import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from '../useDocumentStore';
import { createDocumentFromAbc } from '../../utils/fileSession';
import { storageAdapter } from '../../utils/storageAdapter';
import * as xmlParser from '../../utils/xmlParser';

vi.mock('../../utils/storageAdapter', () => ({ storageAdapter: { getDocuments: vi.fn(), saveDocuments: vi.fn() } }));
const abc = 'X:1\nT:Existing\nM:4/4\nL:1/4\nK:C\nC D E F|]';
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  vi.mocked(storageAdapter.getDocuments).mockResolvedValue([createDocumentFromAbc('Existing.abc', 'abc', abc)]);
  vi.mocked(storageAdapter.saveDocuments).mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('background document creation', () => {
  it('preserves an in-flight ordinary import and its selection when a scan completes', async () => {
    let finish!: (xml: string) => void;
    vi.spyOn(xmlParser, 'extractMusicXml').mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    vi.spyOn(xmlParser, 'parseMusicXmlToAbc').mockReturnValue(abc.replace('Existing', 'Manual import'));
    const { result } = renderHook(() => useDocumentStore());
    await waitFor(() => expect(result.current.hydrationStatus).toBe('ready'));
    let pending!: Promise<void>;
    act(() => { pending = result.current.handleProcessMusicXml(new ArrayBuffer(1), 'Manual.xml'); });
    expect(result.current.loading).toBe(true);
    act(() => { result.current.handleCreateDocument(abc, 'Scan', { id: 'scan-job', activate: false }); });
    expect(result.current.loading).toBe(true);
    await act(async () => { finish('<fixture/>'); await pending; });
    expect(result.current.documents).toHaveLength(3);
    expect(result.current.activeDocument?.name).toBe('Manual.xml');
  });
  it('deduplicates recovered jobs and marks their IDs persisted only after the save resolves', async () => {
    let finish!: () => void;
    vi.mocked(storageAdapter.saveDocuments).mockImplementation(() => new Promise<boolean>((done) => { finish = () => done(true); }));
    const { result } = renderHook(() => useDocumentStore());
    await waitFor(() => expect(result.current.hydrationStatus).toBe('ready'));
    act(() => {
      result.current.handleCreateDocument(abc, 'Scan', { id: 'scan-job', activate: false });
      result.current.handleCreateDocument(abc, 'Scan', { id: 'scan-job', activate: false });
    });
    expect(result.current.documents.filter((document) => document.id === 'scan-job')).toHaveLength(1);
    await waitFor(() => expect(finish).toBeDefined());
    expect(result.current.persistedDocumentIds.has('scan-job')).toBe(false);
    await act(async () => { finish(); });
    expect(result.current.persistedDocumentIds.has('scan-job')).toBe(true);
  });
});
