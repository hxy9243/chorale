import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { storageAdapter } from '../storageAdapter';
import type { FileDocument } from '../../types/document';

const sampleDoc: FileDocument = {
  id: 'doc-1', name: 'Test.abc', sourceType: 'abc',
  abcSource: 'X:1\nT:Test\nK:C\nCDEF|', revision: 1,
  annotations: [], chats: [], versions: [], scoreInfo: { title: 'Test' },
  createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z',
};
const jsonResponse = (value: unknown) => ({
  ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => value,
});

describe('storageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
    storageAdapter.resetSession();
  });
  afterEach(() => {
    delete window.choraleAI;
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the current origin on every HTTP port, including 3000', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ documents: [sampleDoc] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await storageAdapter.getDocuments()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(`${window.location.origin}/v1/workspace`, undefined);
    await storageAdapter.saveDocuments([sampleDoc]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ baseRevisions: { 'doc-1': 1 } });
  });

  it('uses the configured shared service for desktop and browser', async () => {
    window.history.replaceState({}, '', '/?choraleBridge=http://127.0.0.1:1685');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ documents: [sampleDoc] })));
    window.choraleAI = {} as NonNullable<Window['choraleAI']>;
    await storageAdapter.getDocuments();
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:1685/v1/workspace', undefined);
  });

  it.each([false, true])('fails closed on read and save errors, desktop=%s', async (desktop) => {
    if (desktop) window.choraleAI = {} as NonNullable<Window['choraleAI']>;
    const open = vi.fn();
    vi.stubGlobal('indexedDB', { open });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service stopped')));
    await expect(storageAdapter.getDocuments()).rejects.toThrow('have not been replaced');
    await expect(storageAdapter.saveDocuments([sampleDoc])).rejects.toThrow('could not be saved');
    await expect(storageAdapter.getItem('conversation', null)).rejects.toThrow('service stopped');
    await expect(storageAdapter.setItem('conversation', {})).rejects.toThrow('service stopped');
    await expect(storageAdapter.removeItem('conversation')).rejects.toThrow('service stopped');
    expect(open).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('retries after an outage without losing the last successful revision baseline', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ documents: [sampleDoc] }))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValue(jsonResponse({ saved: true }));
    vi.stubGlobal('fetch', fetchMock);
    await storageAdapter.getDocuments();
    await expect(storageAdapter.saveDocuments([sampleDoc])).rejects.toThrow('could not be saved');
    expect(await storageAdapter.saveDocuments([sampleDoc])).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).baseRevisions).toEqual({ 'doc-1': 1 });
  });

  it('keeps concurrent-save conflicts visible without a local write', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    await expect(storageAdapter.saveDocuments([sampleDoc])).rejects.toThrow('Refresh scores before saving');
    expect(localStorage.length).toBe(0);
  });

  it.each([
    { ok: false, status: 503 },
    { ok: true, headers: new Headers({ 'content-type': 'text/html' }) },
    jsonResponse({}),
  ])('rejects failed or invalid workspace responses rather than treating them as an empty library', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(storageAdapter.getDocuments()).rejects.toThrow('have not been replaced');
  });

  it('normalizes documents returned by SQLite', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ documents: [{
      ...sampleDoc, annotations: undefined, chats: undefined, versions: undefined,
    }] })));
    expect((await storageAdapter.getDocuments())[0]).toMatchObject({ annotations: [], chats: [], versions: [] });
  });

  it('reads, writes and removes JSON content exclusively through the shared service', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({ found: true, value: null }))
      .mockResolvedValue(jsonResponse({ saved: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await storageAdapter.getItem('conversation', 'missing')).toBe('missing');
    expect(await storageAdapter.getItem('conversation', 'missing')).toBeNull();
    expect(await storageAdapter.setItem('conversation', { files: {} })).toBe(true);
    expect(await storageAdapter.removeItem('conversation')).toBe(true);
    expect(fetchMock.mock.calls[2]).toEqual([`${window.location.origin}/v1/storage/conversation`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: { files: {} }, baseline: { found: true, value: null } }),
    }]);
    expect(fetchMock.mock.calls[3]).toEqual([`${window.location.origin}/v1/storage/conversation`, { method: 'DELETE' }]);
    expect(localStorage.length).toBe(0);
  });

  it('rejects malformed content responses without treating them as missing data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    await expect(storageAdapter.getItem('conversation', null)).rejects.toThrow('invalid storage content');
  });

  it('rejects invalid storage keys before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(storageAdapter.setItem('../workspace', {})).rejects.toThrow('Invalid storage key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
