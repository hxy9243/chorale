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

  it('normalizes memory documents before returning them', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await storageAdapter.saveDocuments([{
      ...sampleDoc,
      annotations: [{ kind: 'chord', chordSymbol: '', position: null }] as never,
      chats: undefined as never,
    }]);

    const docs = await storageAdapter.getDocuments();

    expect(docs).toHaveLength(1);
    expect(docs[0].annotations).toEqual([]);
    expect(docs[0].chats).toEqual([]);
    expect(docs[0]).not.toBe(sampleDoc);
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

  it('normalizes IndexedDB documents before returning them', async () => {
    const getRequest: Record<string, unknown> = {};
    const database = {
      transaction: vi.fn(() => ({
        objectStore: () => ({
          get: () => {
            queueMicrotask(() => {
              getRequest.result = {
                value: [{ ...sampleDoc, annotations: undefined, versions: undefined }],
              };
              (getRequest.onsuccess as () => void)();
            });
            return getRequest;
          },
        }),
      })),
    };
    const openRequest: Record<string, unknown> = {};
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        queueMicrotask(() => {
          openRequest.result = database;
          (openRequest.onsuccess as () => void)();
        });
        return openRequest;
      }),
    });

    const docs = await storageAdapter.getDocuments();

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ annotations: [], versions: [] });
    expect(database.transaction).toHaveBeenCalledWith('chorale_store', 'readonly');
  });
});
