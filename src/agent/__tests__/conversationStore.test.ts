import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_STORAGE_KEY,
  getConversationTotalTokens,
  parseLegacyThinkingMarkup,
  savePendingQueue,
  VERSION_3_CONVERSATION_STORAGE_KEY,
  clearConversation,
  loadConversation,
  loadConversationAsync,
  makeEmptyConversation,
  saveConversation,
  saveConversationAsync,
} from '../conversationStore';
import type { ChatMessage, PersistedFileConversation, QueuedChatMessage } from '../types';
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

  it('round-trips the versioned Chorale conversation schema v4', () => {
    saveConversation(fileId, buildConversation(messages));

    const loaded = loadConversation(fileId);
    expect(loaded.threads[0].messages).toEqual(messages.map((message) => ({
      ...message,
      parts: [{ type: 'text', text: message.content }],
      profileRoutes: [],
      toolDisplays: [],
      proposals: [],
    })));
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(4);
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
      version: 4,
      files: { 'doc-local': localOnly, 'doc-shared': localCollision },
    }));
    const indexedOnly = buildConversation([{ ...messages[0], id: 'indexed-only', content: 'Durable only.' }]);
    const indexedCollision = buildConversation([{ ...messages[0], id: 'indexed-full', content: 'Full durable.' }]);
    vi.spyOn(storageAdapter, 'getItem').mockResolvedValue({
      version: 4,
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

  it('migrates version 3 storage, preserving the v3 key intact for rollback', () => {
    const v3Store = {
      version: 3,
      files: {
        [fileId]: {
          activeThreadId: 't-1',
          threads: [{
            id: 't-1',
            title: 'V3 Thread',
            updatedAt: '2026-08-15T00:00:00.000Z',
            messages: [{
              id: 'msg-v3',
              role: 'assistant',
              content: '<think>Analyzing harmony...</think>It is a cadence.',
              createdAt: '2026-08-15T00:01:00.000Z',
              status: 'complete',
            }],
          }],
        },
      },
    };
    localStorage.setItem(VERSION_3_CONVERSATION_STORAGE_KEY, JSON.stringify(v3Store));

    const loaded = loadConversation(fileId);
    expect(loaded.threads[0].messages[0].parts).toEqual([
      { type: 'reasoning', text: 'Analyzing harmony...', status: 'complete' },
      { type: 'text', text: 'It is a cadence.' },
    ]);
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(4);
    // V3 storage key remains intact with a valid, unchanged v3 payload for rollback safety!
    const v3Payload = JSON.parse(localStorage.getItem(VERSION_3_CONVERSATION_STORAGE_KEY) ?? '{}');
    expect(v3Payload.version).toBe(3);
    expect(v3Payload.files[fileId].threads[0].messages[0].id).toBe('msg-v3');
  });

  it('safely handles unclosed or malformed <think> tags from interrupted streams', () => {
    const unclosed = parseLegacyThinkingMarkup('<think>Still thinking...', true);
    expect(unclosed).toEqual([
      { type: 'reasoning', text: 'Still thinking...', status: 'stopped' },
    ]);

    const mixed = parseLegacyThinkingMarkup('Prefix <think>Thought</think> Middle <think>Unfinished', true);
    expect(mixed).toEqual([
      { type: 'text', text: 'Prefix ' },
      { type: 'reasoning', text: 'Thought', status: 'complete' },
      { type: 'text', text: ' Middle ' },
      { type: 'reasoning', text: 'Unfinished', status: 'stopped' },
    ]);
  });

  it('persists and restores pending queue, normalizing steer items to queue on restart', () => {
    const pending: QueuedChatMessage[] = [{
      id: 'q-1',
      prompt: 'Check measure 4',
      lane: 'steer',
      createdAt: '2026-09-02T12:00:00.000Z',
      context: {
        id: 'ctx-1',
        documentId: fileId,
        revision: 1,
        capturedAt: '2026-09-02T12:00:00.000Z',
        fileName: 'score.abc',
        abc: 'X:1\nK:C\nC4|',
        annotations: [],
      },
    }];
    const conversation = buildConversation(messages);
    conversation.threads[0].pendingMessages = pending;
    saveConversation(fileId, conversation);

    const loaded = loadConversation(fileId);
    // Restored steer items normalize to ordinary FIFO queue (lane: 'queue') and never auto-run
    expect(loaded.threads[0].pendingMessages).toEqual([{
      ...pending[0],
      lane: 'queue',
    }]);
  });

  it('supports queue-only persistence during active streaming runs', () => {
    saveConversation(fileId, buildConversation(messages));
    const threadId = loadConversation(fileId).activeThreadId;

    const queued: QueuedChatMessage = {
      id: 'q-queued',
      prompt: 'Followup while running',
      lane: 'queue',
      createdAt: '2026-09-02T12:05:00.000Z',
      context: {
        id: 'ctx-2',
        documentId: fileId,
        revision: 1,
        capturedAt: '2026-09-02T12:05:00.000Z',
        fileName: 'score.abc',
        abc: 'X:1\nK:C\nC4|',
        annotations: [],
      },
    };

    savePendingQueue(fileId, threadId, [queued]);
    expect(loadConversation(fileId).threads[0].pendingMessages).toEqual([queued]);
  });

  it('calculates conversation total tokens from stored round usage to prevent drift', () => {
    const thread = buildConversation([{
      ...messages[0],
      role: 'assistant',
      usage: {
        input: 100,
        output: 50,
        cacheRead: 20,
        cacheWrite: 10,
        totalTokens: 180,
      },
    }, {
      ...messages[0],
      id: 'msg-2',
      role: 'assistant',
      usage: {
        input: 150,
        output: 75,
        cacheRead: 30,
        cacheWrite: 0,
        totalTokens: 255,
      },
    }]).threads[0];

    expect(getConversationTotalTokens(thread)).toBe(435);
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
