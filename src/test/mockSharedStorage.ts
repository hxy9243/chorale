// Explicit component-test fixture. Production always requires the SQLite service.
import { vi } from 'vitest';

vi.mock('../utils/storageAdapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/storageAdapter')>();
  const { normalizeFileDocument } = await import('../music/documentSchema');
  const values = new Map<string, unknown>();
  let documents: unknown[] = [];
  return {
    storageAdapter: {
      ...actual.storageAdapter,
      resetSession: () => { documents = []; values.clear(); },
      getDocuments: async () => documents.flatMap(value => {
        const doc = normalizeFileDocument(structuredClone(value));
        return doc ? [doc] : [];
      }),
      saveDocuments: async (next: unknown[]) => { documents = structuredClone(next); return true; },
      getItem: async <T>(key: string, fallback: T) => values.has(key) ? structuredClone(values.get(key)) : fallback,
      setItem: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); return true; },
      removeItem: async (key: string) => { values.delete(key); return true; },
    },
  };
});
