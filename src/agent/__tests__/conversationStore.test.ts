import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_STORAGE_KEY,
  conversationNeedsDurableHydration,
  VERSION_2_CONVERSATION_STORAGE_KEY,
  clearConversation,
  loadConversation,
  loadConversationAsync,
  makeEmptyConversation,
  migrateConversationStore,
  saveConversation,
  saveConversationAsync,
} from '../conversationStore';
import type { ChatMessage, PersistedFileConversation } from '../types';
import { storageAdapter } from '../../utils/storageAdapter';

const messages: ChatMessage[] = [{
  id: 'message-1',
  role: 'user',
  content: 'Explain this phrase.',
  createdAt: '2026-07-23T12:00:00.000Z',
  status: 'complete',
}];
const fileId = 'doc-1';

const buildConversation = (nextMessages: ChatMessage[]): PersistedFileConversation => {
  const conversation = makeEmptyConversation();
  return {
    ...conversation,
    threads: [{
      ...conversation.threads[0],
      title: 'Explain this phrase.',
      messages: nextMessages,
    }],
  };
};

describe('conversationStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    storageAdapter.clearMemoryStore();
  });

  it('round-trips the versioned Chorale conversation schema', () => {
    saveConversation(fileId, buildConversation(messages));

    expect(loadConversation(fileId).threads[0].messages).toEqual(messages.map((message) => ({
      ...message,
      profileRoutes: [],
      toolDisplays: [],
      proposals: [],
    })));
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(3);
  });

  it('round-trips conversations through durable storage', async () => {
    await saveConversationAsync(fileId, buildConversation(messages));

    await expect(loadConversationAsync(fileId)).resolves.toMatchObject({
      threads: [{ messages: [{ id: 'message-1', content: 'Explain this phrase.' }] }],
    });
  });

  it('hydrates local-only files while preferring full durable data for collisions', async () => {
    const localOnly = buildConversation([{ ...messages[0], id: 'local-only', content: 'Local recovery.' }]);
    const localCollision = buildConversation([{ ...messages[0], id: 'local-old', content: 'Compact local.' }]);
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 3,
      files: { 'doc-local': localOnly, 'doc-shared': localCollision },
    }));
    const indexedOnly = buildConversation([{ ...messages[0], id: 'indexed-only', content: 'Durable only.' }]);
    const indexedCollision = buildConversation([{ ...messages[0], id: 'indexed-full', content: 'Full durable.' }]);
    vi.spyOn(storageAdapter, 'getItem').mockResolvedValue({
      version: 3,
      files: { 'doc-indexed': indexedOnly, 'doc-shared': indexedCollision },
    });
    const setItem = vi.spyOn(storageAdapter, 'setItem').mockResolvedValue(true);

    await expect(loadConversationAsync('doc-local')).resolves.toMatchObject({
      threads: [{ messages: [{ id: 'local-only', content: 'Local recovery.' }] }],
    });
    await expect(loadConversationAsync('doc-shared')).resolves.toMatchObject({
      threads: [{ messages: [{ id: 'indexed-full', content: 'Full durable.' }] }],
    });
    expect(setItem).toHaveBeenCalledWith(CONVERSATION_STORAGE_KEY, expect.objectContaining({
      files: expect.objectContaining({
        'doc-local': expect.any(Object),
        'doc-indexed': expect.any(Object),
        'doc-shared': expect.any(Object),
      }),
    }));
  });

  it('falls back to a compact local mirror when score proposals exceed local storage quota', () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === CONVERSATION_STORAGE_KEY && value.includes('replacementAbc')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const scoreProposalMessage: ChatMessage = {
      ...messages[0],
      role: 'assistant',
      scoreProposals: [{
        id: 'score-proposal-large',
        runId: 'run-large',
        documentId: fileId,
        sourceRevision: 1,
        state: 'proposed',
        kind: 'replace-score',
        span: { startMeasure: 1, endMeasure: 1 },
        summary: 'Large score rewrite.',
        replacementAbc: 'X:1\nK:C\nC4 |]',
        validation: { status: 'valid', errors: [] },
      }],
    };

    saveConversation(fileId, buildConversation([scoreProposalMessage]));

    expect(conversationNeedsDurableHydration(fileId)).toBe(true);
    expect(localStorage.getItem(CONVERSATION_STORAGE_KEY)).not.toContain('replacementAbc');
    saveConversation('doc-small', buildConversation(messages));
    expect(conversationNeedsDurableHydration(fileId)).toBe(true);
    setItem.mockRestore();
  });

  it('restores full score proposals from durable storage after a compact quota fallback', async () => {
    let durableStore: unknown = null;
    vi.spyOn(storageAdapter, 'getItem').mockImplementation(async (_key, fallback) => (
      (durableStore ?? fallback) as typeof fallback
    ));
    vi.spyOn(storageAdapter, 'setItem').mockImplementation(async (_key, value) => {
      durableStore = value;
      return true;
    });
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === CONVERSATION_STORAGE_KEY && value.includes('replacementAbc')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const scoreProposalMessage: ChatMessage = {
      ...messages[0],
      role: 'assistant',
      scoreProposals: [{
        id: 'score-proposal-recovery',
        runId: 'run-recovery',
        documentId: fileId,
        sourceRevision: 1,
        state: 'proposed',
        kind: 'replace-score',
        span: { startMeasure: 1, endMeasure: 1 },
        summary: 'Recover this score rewrite.',
        replacementAbc: 'X:1\nK:C\nC4 |]',
        validation: { status: 'valid', errors: [] },
      }],
    };
    const conversation = buildConversation([scoreProposalMessage]);

    saveConversation(fileId, conversation);
    expect(conversationNeedsDurableHydration(fileId)).toBe(true);
    expect(localStorage.getItem(CONVERSATION_STORAGE_KEY)).not.toContain('replacementAbc');

    await saveConversationAsync(fileId, conversation);
    await expect(loadConversationAsync(fileId)).resolves.toMatchObject({
      threads: [{
        messages: [{
          scoreProposals: [{
            id: 'score-proposal-recovery',
            replacementAbc: 'X:1\nK:C\nC4 |]',
            state: 'proposed',
          }],
        }],
      }],
    });
    setItem.mockRestore();
  });

  it('reports durable write failure and retains the hydration marker', async () => {
    vi.spyOn(storageAdapter, 'getItem').mockResolvedValue(null);
    vi.spyOn(storageAdapter, 'setItem').mockResolvedValue(false);
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === CONVERSATION_STORAGE_KEY && value.includes('replacementAbc')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const conversation = buildConversation([{
      ...messages[0],
      role: 'assistant',
      scoreProposals: [{
        id: 'score-proposal-unsaved',
        runId: 'run-unsaved',
        documentId: fileId,
        sourceRevision: 1,
        state: 'proposed',
        kind: 'replace-score',
        span: { startMeasure: 1, endMeasure: 1 },
        summary: 'Unsaved score rewrite.',
        replacementAbc: 'X:1\nK:C\nC4 |]',
        validation: { status: 'valid', errors: [] },
      }],
    }]);

    saveConversation(fileId, conversation);

    await expect(saveConversationAsync(fileId, conversation)).resolves.toBe(false);
    expect(conversationNeedsDurableHydration(fileId)).toBe(true);
    setItem.mockRestore();
  });

  it('purely migrates version 2 messages with default proposal and tool metadata', () => {
    const version2 = {
      version: 2,
      files: {
        [fileId]: buildConversation(messages),
      },
    };

    expect(migrateConversationStore(version2)).toMatchObject({
      version: 3,
      files: {
        [fileId]: {
          threads: [{
            messages: [{
              id: 'message-1',
              profileRoutes: [],
              toolDisplays: [],
              proposals: [],
            }],
          }],
        },
      },
    });
    expect(version2.version).toBe(2);
    expect(version2.files[fileId].threads[0].messages[0]).not.toHaveProperty('proposals');
  });

  it('loads version 2 storage once and persists the migrated version 3 store', () => {
    localStorage.setItem(VERSION_2_CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 2,
      files: { [fileId]: buildConversation(messages) },
    }));

    expect(loadConversation(fileId).threads[0].messages[0]).toMatchObject({ proposals: [] });
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(3);
    expect(localStorage.getItem(VERSION_2_CONVERSATION_STORAGE_KEY)).toBeNull();
  });

  it('marks an interrupted streaming message as stopped on reload', () => {
    saveConversation(fileId, buildConversation([{ ...messages[0], status: 'streaming' }]));

    expect(loadConversation(fileId).threads[0].messages[0].status).toBe('stopped');
  });

  it('ignores malformed storage and clears saved history', () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, '{not json');
    expect(loadConversation(fileId).threads[0].messages).toEqual([]);

    saveConversation(fileId, buildConversation(messages));
    clearConversation(fileId);
    expect(loadConversation(fileId).threads[0].messages).toEqual([]);
  });
});
