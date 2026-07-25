import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONVERSATION_STORAGE_KEY,
  clearConversation,
  loadConversation,
  saveConversation,
} from '../conversationStore';
import type { ChatMessage } from '../types';

const messages: ChatMessage[] = [{
  id: 'message-1',
  role: 'user',
  content: 'Explain this phrase.',
  createdAt: '2026-07-23T12:00:00.000Z',
  status: 'complete',
}];

describe('conversationStore', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the versioned Chorale conversation schema', () => {
    saveConversation(messages);

    expect(loadConversation()).toEqual(messages);
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(1);
  });

  it('marks an interrupted streaming message as stopped on reload', () => {
    saveConversation([{ ...messages[0], status: 'streaming' }]);

    expect(loadConversation()[0].status).toBe('stopped');
  });

  it('ignores malformed storage and clears saved history', () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, '{not json');
    expect(loadConversation()).toEqual([]);

    saveConversation(messages);
    clearConversation();
    expect(loadConversation()).toEqual([]);
  });
});
