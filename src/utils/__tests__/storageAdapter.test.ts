import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { storageAdapter } from '../storageAdapter';
import type { FileDocument } from '../../types/document';

describe('storageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
    storageAdapter.clearMemoryStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleDoc: FileDocument = {
    id: 'doc-1',
    name: 'Test.abc',
    sourceType: 'abc',
    abcSource: 'X:1\nT:Test\nK:C\nCDEF|',
    revision: 1,
    annotations: [],
    chats: [],
    versions: [],
    scoreInfo: { title: 'Test' },
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };

  it('saves and retrieves documents using memory storage when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);

    const success = await storageAdapter.saveDocuments([sampleDoc]);
    expect(success).toBe(true);

    const docs = await storageAdapter.getDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('Test.abc');

    // localStorage must NOT contain documents (IndexedDB is single authority)
    expect(localStorage.getItem('chorale.workspace.documents')).toBeNull();
  });

  it('rejects the save when IndexedDB cannot be opened', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        throw new Error('IndexedDB open failed');
      }),
    });

    await expect(storageAdapter.saveDocuments([sampleDoc])).rejects.toThrow(
      'IndexedDB open failed',
    );
  });
});
