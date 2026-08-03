import { describe, expect, it, vi, beforeEach } from 'vitest';
import { storageAdapter } from '../storageAdapter';
import type { FileDocument } from '../../types/document';

describe('storageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
    storageAdapter.clearMemoryStore();
    vi.clearAllMocks();
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

  it('reads stored legacy documents synchronously from localStorage fallback', () => {
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([sampleDoc]));

    const loaded = storageAdapter.getLegacyLocalStorageDocuments();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Test.abc');
  });

  it('clears legacy localStorage documents key', () => {
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([sampleDoc]));
    expect(storageAdapter.getLegacyLocalStorageDocuments()).toHaveLength(1);

    storageAdapter.clearLegacyLocalStorageDocuments();
    expect(storageAdapter.getLegacyLocalStorageDocuments()).toHaveLength(0);
    expect(localStorage.getItem('chorale.workspace.documents')).toBeNull();
  });

  it('saves documents without writing to localStorage', async () => {
    const success = await storageAdapter.saveDocuments([sampleDoc]);
    expect(success).toBe(true);

    // localStorage must NOT contain documents (IndexedDB is single authority)
    expect(localStorage.getItem('chorale.workspace.documents')).toBeNull();
  });
});
