import type { ChatMessage, PersistedConversation } from './types';

export const CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v1';

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string'
  );
};

export const loadConversation = (storage: Storage = window.localStorage): ChatMessage[] => {
  try {
    const serialized = storage.getItem(CONVERSATION_STORAGE_KEY);
    if (!serialized) return [];

    const parsed = JSON.parse(serialized) as Partial<PersistedConversation>;
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return [];

    return parsed.messages.filter(isChatMessage).map((message) => ({
      ...message,
      status: message.status === 'streaming' ? 'stopped' : message.status,
    }));
  } catch {
    return [];
  }
};

export const saveConversation = (
  messages: ChatMessage[],
  storage: Storage = window.localStorage,
) => {
  try {
    const conversation: PersistedConversation = { version: 1, messages };
    storage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(conversation));
  } catch {
    // Conversation persistence is best-effort in private or quota-limited browsers.
  }
};

export const clearConversation = (storage: Storage = window.localStorage) => {
  try {
    storage.removeItem(CONVERSATION_STORAGE_KEY);
  } catch {
    // Keep the in-memory conversation usable when storage is unavailable.
  }
};
