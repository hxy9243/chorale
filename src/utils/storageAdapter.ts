import type { FileDocument } from '../types/document';
import { normalizeFileDocument } from '../music/documentSchema';
import { limitScoreVersions } from './fileSession';

type StorageBaseline = { found: boolean; value?: unknown };
const itemBaselines = new Map<string, StorageBaseline>();

let sharedBaseRevisions: Record<string, number> | undefined;

class SharedWorkspaceConflictError extends Error {}

const sharedServiceBase = (): string => {
  if (typeof window === 'undefined') throw new Error('The shared Chorale service is unavailable.');
  if (window.choraleAI && window.location.protocol === 'app:') return 'app://chorale';
  const configured = new URLSearchParams(window.location.search).get('choraleBridge');
  if (configured) return configured;
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.origin;
  }
  throw new Error('The shared Chorale service is unavailable.');
};

const sharedWorkspace = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${sharedServiceBase()}${path}`, options);
  if (response.status === 409) throw new SharedWorkspaceConflictError('The shared workspace changed in another client. Refresh scores before saving. Your changes have not been saved.');
  if (!response.ok) throw new Error('The shared Chorale service is unavailable.');
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The shared Chorale service returned invalid content.');
  }
  return response.json() as Promise<T>;
};

const storagePath = (key: string): string => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(key)) throw new Error('Invalid storage key.');
  return `/v1/storage/${key}`;
};

export const storageAdapter = {
  resetSession(): void {
    sharedBaseRevisions = undefined;
    itemBaselines.clear();
  },

  async getDocuments(): Promise<FileDocument[]> {
    try {
      const workspace = await sharedWorkspace<{ documents: unknown[] }>('/v1/workspace');
      if (!Array.isArray(workspace.documents)) throw new Error('Invalid workspace documents.');
      const documents = workspace.documents.flatMap((value) => {
        const document = normalizeFileDocument(value);
        return document ? [{ ...document, versions: limitScoreVersions(document.versions) }] : [];
      });
      sharedBaseRevisions = Object.fromEntries(documents.map(doc => [doc.id, doc.revision]));
      return documents;
    } catch {
      throw new Error('The shared Chorale service could not load your scores. Your scores have not been replaced.');
    }
  },

  async saveDocuments(documents: FileDocument[]): Promise<boolean> {
    try {
      await sharedWorkspace('/v1/workspace/documents', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documents, baseRevisions: sharedBaseRevisions }),
      });
      sharedBaseRevisions = Object.fromEntries(documents.map(doc => [doc.id, doc.revision]));
      return true;
    } catch (error) {
      if (error instanceof SharedWorkspaceConflictError) throw error;
      throw new Error('The shared Chorale service is unavailable. Changes could not be saved.');
    }
  },

  async getItem<T>(key: string, fallback: T): Promise<T> {
    const result = await sharedWorkspace<{ found: boolean; value?: T }>(storagePath(key));
    if (!result || typeof result.found !== 'boolean' || (result.found && !Object.hasOwn(result, 'value'))) {
      throw new Error('The shared Chorale service returned invalid storage content.');
    }
    itemBaselines.set(key, structuredClone(result));
    return result.found ? result.value as T : fallback;
  },

  async setItem<T>(key: string, value: T): Promise<boolean> {
    await sharedWorkspace(storagePath(key), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, baseline: itemBaselines.get(key) }),
    });
    itemBaselines.set(key, { found: true, value: structuredClone(value) });
    return true;
  },

  async removeItem(key: string): Promise<boolean> {
    await sharedWorkspace(storagePath(key), { method: 'DELETE' });
    itemBaselines.set(key, { found: false });
    return true;
  },
};
