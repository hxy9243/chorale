import { describe, expect, it, vi, beforeEach } from 'vitest';
import { storageAdapter } from '../storageAdapter';
import type { FileDocument } from '../../types/document';

describe('storageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('reads stored documents synchronously from localStorage fallback', () => {
    const testDocs: FileDocument[] = [
      {
        id: 'doc-1',
        name: 'Test.abc',
        sourceType: 'abc',
        abcSource: 'X:1\nT:Test\nK:C\nCDEF|',
        revision: 1,
        versions: [],
        scoreInfo: { title: 'Test' },
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
    ];
    localStorage.setItem('chorale.workspace.documents', JSON.stringify(testDocs));

    const loaded = storageAdapter.readStoredDocumentsSync();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Test.abc');
  });

  it('safely handles quota errors in localStorage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    await expect(storageAdapter.setItem('key-test', { data: 'hello' })).rejects.toThrow();
  });
});
