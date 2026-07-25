import type {
  ChatMessage,
  ChatThread,
  PersistedConversationStore,
  PersistedFileConversation,
} from './types';

export const LEGACY_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v1';
export const CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v2';

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

const normalizeMessages = (messages: ChatMessage[]): ChatMessage[] => (
  messages.filter(isChatMessage).map((message) => ({
    ...message,
    status: message.status === 'streaming' ? 'stopped' : message.status,
  }))
);

const isChatThread = (value: unknown): value is ChatThread => {
  if (!value || typeof value !== 'object') return false;
  const thread = value as Partial<ChatThread>;
  return (
    typeof thread.id === 'string' &&
    typeof thread.title === 'string' &&
    typeof thread.updatedAt === 'string' &&
    Array.isArray(thread.messages)
  );
};

const createEmptyThread = (title = 'New thread'): ChatThread => ({
  id: `thread-${crypto.randomUUID()}`,
  title,
  updatedAt: new Date().toISOString(),
  messages: [],
});

const createDefaultFileConversation = (): PersistedFileConversation => {
  const thread = createEmptyThread();
  return {
    activeThreadId: thread.id,
    threads: [thread],
  };
};

const loadStore = (storage: Storage): PersistedConversationStore => {
  try {
    const serialized = storage.getItem(CONVERSATION_STORAGE_KEY);
    if (!serialized) return { version: 2, files: {} };

    const parsed = JSON.parse(serialized) as Partial<PersistedConversationStore>;
    if (parsed.version !== 2 || !parsed.files || typeof parsed.files !== 'object') {
      return { version: 2, files: {} };
    }

    const files = Object.fromEntries(
      Object.entries(parsed.files).flatMap(([fileId, value]) => {
        if (!value || typeof value !== 'object') return [];
        const fileConversation = value as Partial<PersistedFileConversation>;
        if (!Array.isArray(fileConversation.threads)) return [];

        const threads = fileConversation.threads.filter(isChatThread).map((thread) => ({
          ...thread,
          messages: normalizeMessages(thread.messages),
        }));
        if (threads.length === 0) return [];

        const activeThreadId = threads.some((thread) => thread.id === fileConversation.activeThreadId)
          ? fileConversation.activeThreadId as string
          : threads[0].id;

        return [[fileId, { activeThreadId, threads }]];
      }),
    );

    return { version: 2, files };
  } catch {
    return { version: 2, files: {} };
  }
};

const saveStore = (
  store: PersistedConversationStore,
  storage: Storage,
) => {
  storage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(store));
};

const loadLegacyMessages = (storage: Storage): ChatMessage[] => {
  try {
    const serialized = storage.getItem(LEGACY_CONVERSATION_STORAGE_KEY);
    if (!serialized) return [];
    const parsed = JSON.parse(serialized) as Partial<{ version: number; messages: ChatMessage[] }>;
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return [];
    return normalizeMessages(parsed.messages);
  } catch {
    return [];
  }
};

export const loadConversation = (
  fileId: string,
  storage: Storage = window.localStorage,
): PersistedFileConversation => {
  const store = loadStore(storage);
  const existing = store.files[fileId];
  if (existing) return existing;

  const legacyMessages = loadLegacyMessages(storage);
  if (legacyMessages.length > 0) {
    const title = legacyMessages.find((message) => message.role === 'user')?.content.slice(0, 48) || 'Imported thread';
    return {
      activeThreadId: 'thread-legacy',
      threads: [{
        id: 'thread-legacy',
        title,
        updatedAt: legacyMessages[legacyMessages.length - 1]?.createdAt || new Date().toISOString(),
        messages: legacyMessages,
      }],
    };
  }

  return createDefaultFileConversation();
};

export const saveConversation = (
  fileId: string,
  conversation: PersistedFileConversation,
  storage: Storage = window.localStorage,
) => {
  try {
    const store = loadStore(storage);
    saveStore({
      version: 2,
      files: {
        ...store.files,
        [fileId]: {
          activeThreadId: conversation.activeThreadId,
          threads: conversation.threads.map((thread) => ({
            ...thread,
            messages: normalizeMessages(thread.messages),
          })),
        },
      },
    }, storage);
    storage.removeItem(LEGACY_CONVERSATION_STORAGE_KEY);
  } catch {
    // Conversation persistence is best-effort in private or quota-limited browsers.
  }
};

export const clearConversation = (
  fileId: string,
  storage: Storage = window.localStorage,
) => {
  try {
    const store = loadStore(storage);
    const nextFiles = { ...store.files };
    delete nextFiles[fileId];
    saveStore({ version: 2, files: nextFiles }, storage);
    storage.removeItem(LEGACY_CONVERSATION_STORAGE_KEY);
  } catch {
    // Keep the in-memory conversation usable when storage is unavailable.
  }
};

export const makeEmptyConversation = () => createDefaultFileConversation();
