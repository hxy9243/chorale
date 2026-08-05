import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONVERSATION_STORAGE_KEY,
  VERSION_2_CONVERSATION_STORAGE_KEY,
  clearConversation,
  loadConversation,
  makeEmptyConversation,
  migrateConversationStore,
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

    expect(loadConversation(fileId).threads[0].messages).toEqual(messages.map((message) => ({
      ...message,
      profileRoutes: [],
      toolDisplays: [],
      proposals: [],
    })));
    expect(JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}').version).toBe(3);
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
