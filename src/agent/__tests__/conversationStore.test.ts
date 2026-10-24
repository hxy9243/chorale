import '../../test/mockSharedStorage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_STORAGE_KEY,
  getConversationTotalTokens,
  parseLegacyThinkingMarkup,
  loadConversationAsync,
  makeEmptyConversation,
  saveConversationAsync,
  savePendingQueueAsync,
} from '../conversationStore';
import type { ChatMessage, PersistedFileConversation, QueuedChatMessage } from '../types';
import { storageAdapter } from '../../utils/storageAdapter';

const messages: ChatMessage[] = [{
  id: 'message-1', role: 'user', content: 'Explain this phrase.',
  createdAt: '2026-07-23T12:00:00.000Z', status: 'complete',
}];
const fileId = 'doc-1';
const buildConversation = (nextMessages = messages): PersistedFileConversation => {
  const conversation = makeEmptyConversation();
  return { ...conversation, threads: [{ ...conversation.threads[0], messages: nextMessages }] };
};

describe('conversationStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    storageAdapter.resetSession();
  });

  it('round-trips full conversations and score context through the shared service only', async () => {
    expect(await saveConversationAsync(fileId, buildConversation())).toBe(true);
    await expect(loadConversationAsync(fileId)).resolves.toMatchObject({
      threads: [{ messages: [{ id: 'message-1', content: 'Explain this phrase.' }] }],
    });
    expect(localStorage.getItem(CONVERSATION_STORAGE_KEY)).toBeNull();
  });

  it('ignores legacy browser conversations instead of importing them', async () => {
    const stale = JSON.stringify({ version: 4, files: { [fileId]: buildConversation() } });
    localStorage.setItem(CONVERSATION_STORAGE_KEY, stale);
    localStorage.setItem('chorale.pi-agent-conversation.v3', stale);
    await expect(loadConversationAsync(fileId)).resolves.toMatchObject({ threads: [{ messages: [] }] });
    expect(localStorage.getItem(CONVERSATION_STORAGE_KEY)).toBe(stale);
  });

  it('propagates load failures and reports failed saves without a local copy', async () => {
    vi.spyOn(storageAdapter, 'getItem').mockRejectedValue(new Error('Service unavailable'));
    await expect(loadConversationAsync(fileId)).rejects.toThrow('Service unavailable');
    expect(await saveConversationAsync(fileId, buildConversation())).toBe(false);
    expect(localStorage.getItem(CONVERSATION_STORAGE_KEY)).toBeNull();
  });

  it('retries successful saves after an outage and preserves other files', async () => {
    const write = vi.spyOn(storageAdapter, 'setItem').mockRejectedValueOnce(new Error('Service unavailable'));
    expect(await saveConversationAsync(fileId, buildConversation())).toBe(false);
    expect(await saveConversationAsync('doc-2', buildConversation())).toBe(true);
    expect(await saveConversationAsync(fileId, buildConversation())).toBe(true);
    const stored = await storageAdapter.getItem<any>(CONVERSATION_STORAGE_KEY, null);
    expect(Object.keys(stored.files).sort()).toEqual(['doc-1', 'doc-2']);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('waits for a pending save before reloading a file', async () => {
    const saving = saveConversationAsync(fileId, buildConversation());
    await expect(loadConversationAsync(fileId)).resolves.toMatchObject({
      threads: [{ messages: [{ id: 'message-1' }] }],
    });
    expect(await saving).toBe(true);
  });

  it('restores pending queues without automatically running steer items', async () => {
    const conversation = buildConversation();
    await saveConversationAsync(fileId, conversation);
    const queued: QueuedChatMessage = {
      id: 'q-1', prompt: 'Check measure 4', lane: 'steer',
      createdAt: '2026-09-02T12:00:00.000Z',
      context: { id: 'ctx-1', documentId: fileId, revision: 1,
        capturedAt: '2026-09-02T12:00:00.000Z', fileName: 'score.abc',
        abc: 'X:1\nK:C\nC4|', annotations: [] },
    };
    expect(await savePendingQueueAsync(fileId, conversation.activeThreadId, [queued])).toBe(true);
    const loaded = await loadConversationAsync(fileId);
    expect(loaded.threads[0].pendingMessages).toEqual([{ ...queued, lane: 'queue' }]);
  });

  it('marks an interrupted streaming message as stopped on reload', async () => {
    await saveConversationAsync(fileId, buildConversation([{ ...messages[0], status: 'streaming' }]));
    expect((await loadConversationAsync(fileId)).threads[0].messages[0].status).toBe('stopped');
  });

  it('handles malformed stored values without consulting browser storage', async () => {
    await storageAdapter.setItem(CONVERSATION_STORAGE_KEY, '{not json');
    await expect(loadConversationAsync(fileId)).resolves.toMatchObject({ threads: [{ messages: [] }] });
  });

  it('safely handles interrupted thinking markup', () => {
    expect(parseLegacyThinkingMarkup('<think>Still thinking...', true)).toEqual([
      { type: 'reasoning', text: 'Still thinking...', status: 'stopped' },
    ]);
  });

  it('calculates conversation tokens from stored round usage', () => {
    const thread = buildConversation([{ ...messages[0], role: 'assistant',
      usage: { input: 100, output: 50, cacheRead: 20, cacheWrite: 10, totalTokens: 180 } },
    { ...messages[0], id: 'msg-2', role: 'assistant',
      usage: { input: 150, output: 75, cacheRead: 30, cacheWrite: 0, totalTokens: 255 } }]).threads[0];
    expect(getConversationTotalTokens(thread)).toBe(435);
  });
});
