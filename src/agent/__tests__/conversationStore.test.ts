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
