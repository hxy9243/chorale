import type { FileDocument } from '../types/document';
import { limitScoreVersions } from './fileSession';

const DB_NAME = 'chorale_db';
const DB_VERSION = 1;
const STORE_NAME = 'chorale_store';
export const DOCUMENTS_STORAGE_KEY = 'chorale.workspace.documents';

type IndexedDBRecord = {
  key: string;
  value: unknown;
};

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryStore = new Map<string, unknown>();

const getIDB = (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB.'));
      };
    });
  }
  return dbPromise;
};

export const storageAdapter = {
  clearMemoryStore(): void {
    memoryStore.clear();
  },

  async getDocuments(): Promise<FileDocument[]> {
    if (memoryStore.has(DOCUMENTS_STORAGE_KEY)) {
      const memDocs = memoryStore.get(DOCUMENTS_STORAGE_KEY) as FileDocument[];
      return memDocs.map((document) => ({
        ...document,
        versions: limitScoreVersions(Array.isArray(document.versions) ? document.versions : []),
      }));
    }

    try {
      const db = await getIDB();
      const rawDocs = await new Promise<FileDocument[] | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(DOCUMENTS_STORAGE_KEY);
        req.onsuccess = () => {
          if (req.result && 'value' in (req.result as IndexedDBRecord)) {
            resolve((req.result as IndexedDBRecord).value as FileDocument[]);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });

      if (rawDocs && Array.isArray(rawDocs)) {
        return rawDocs.map((document) => ({
          ...document,
          versions: limitScoreVersions(Array.isArray(document.versions) ? document.versions : []),
        }));
      }
    } catch {
      // IDB unavailable or failed
    }

    return [];
  },

  async saveDocuments(documents: FileDocument[]): Promise<boolean> {
    memoryStore.set(DOCUMENTS_STORAGE_KEY, documents);
    try {
      const db = await getIDB();
      return await new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ key: DOCUMENTS_STORAGE_KEY, value: documents });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      // In environments without IndexedDB (e.g. JSDOM unit tests), memoryStore holds the documents
      return true;
    }
  },

  async getItem<T>(key: string, fallback: T): Promise<T> {
    try {
      const db = await getIDB();
      return await new Promise<T>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && 'value' in (req.result as IndexedDBRecord)) {
            resolve((req.result as IndexedDBRecord).value as T);
          } else {
            resolve(fallback);
          }
        };
        req.onerror = () => resolve(fallback);
      });
    } catch {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as T) : fallback;
        } catch {
          return fallback;
        }
      }
      return fallback;
    }
  },

  async setItem<T>(key: string, value: T): Promise<boolean> {
    if (key === DOCUMENTS_STORAGE_KEY) {
      return this.saveDocuments(value as unknown as FileDocument[]);
    }
    let savedInIDB = false;
    try {
      const db = await getIDB();
      savedInIDB = await new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ key, value });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      savedInIDB = false;
    }

    let savedInLocalStorage = false;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        savedInLocalStorage = true;
      } catch {
        // Ignore quota or write errors
      }
    }
    return savedInIDB || savedInLocalStorage;
  },

  async removeItem(key: string): Promise<boolean> {
    if (key === DOCUMENTS_STORAGE_KEY) {
      memoryStore.delete(DOCUMENTS_STORAGE_KEY);
    }
    try {
      const db = await getIDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
    return true;
  },
};
