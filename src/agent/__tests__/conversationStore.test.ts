import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONVERSATION_STORAGE_KEY,
  clearConversation,
  loadConversation,
  makeEmptyConversation,
  saveConversation,
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
  beforeEach(() => localStorage.clear());

  it('round-trips the versioned Chorale conversation schema', () => {
    saveConversation(fileId, buildConversation(messages));

    expect(loadConversation(fileId).threads[0].messages).toEqual(messages);
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(2);
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
