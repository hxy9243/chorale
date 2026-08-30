import type {
  ChatMessage,
  ChatThread,
  PersistedConversationStore,
  PersistedFileConversation,
} from './types';
import type { AgentProfileId } from '../types/document';
import { validateAnnotationProposal, validateScoreChangeProposal } from '../music/documentSchema';
import { storageAdapter } from '../utils/storageAdapter';

export const LEGACY_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v1';
export const VERSION_2_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v2';
export const CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v3';
export const DURABLE_CONVERSATION_MARKER_PREFIX = 'chorale.pi-agent-conversation.durable.';

const durableConversationMarkerKey = (fileId: string): string => (
  `${DURABLE_CONVERSATION_MARKER_PREFIX}${fileId}`
);

const PROFILE_IDS: AgentProfileId[] = [
  'general',
  'harmony',
  'voice-leading',
  'form-phrase',
];

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
    profileRoutes: Array.isArray(message.profileRoutes)
      ? [...new Set(message.profileRoutes.filter((profile) => PROFILE_IDS.includes(profile)))]
      : [],
    toolDisplays: Array.isArray(message.toolDisplays)
      ? message.toolDisplays.flatMap((tool) => (
          tool
          && typeof tool.toolCallId === 'string'
          && typeof tool.toolName === 'string'
          && ['running', 'success', 'error'].includes(tool.status)
          && typeof tool.summary === 'string'
            ? [{ ...tool }]
            : []
        ))
      : [],
    proposals: Array.isArray(message.proposals)
      ? message.proposals.flatMap((proposal) => {
          const validated = validateAnnotationProposal(proposal);
          return validated ? [validated] : [];
        })
      : [],
    ...(Array.isArray(message.scoreProposals)
      ? {
          scoreProposals: message.scoreProposals.flatMap((proposal) => {
            const validated = validateScoreChangeProposal(proposal);
            return validated ? [validated] : [];
          }),
        }
      : {}),
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

export const migrateConversationStore = (value: unknown): PersistedConversationStore => {
  if (!value || typeof value !== 'object') return { version: 3, files: {} };
  const parsed = value as { version?: unknown; files?: unknown };
  if (
    (parsed.version !== 2 && parsed.version !== 3)
    || !parsed.files
    || typeof parsed.files !== 'object'
    || Array.isArray(parsed.files)
  ) {
    return { version: 3, files: {} };
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
  return { version: 3, files };
};

const parseStored = (serialized: string | null): unknown => {
  if (!serialized) return null;
  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
};

const loadStore = (storage: Storage): PersistedConversationStore => {
  const current = migrateConversationStore(parseStored(storage.getItem(CONVERSATION_STORAGE_KEY)));
  if (Object.keys(current.files).length > 0) return current;

  const version2Value = parseStored(storage.getItem(VERSION_2_CONVERSATION_STORAGE_KEY));
  const version2 = migrateConversationStore(version2Value);
  if (Object.keys(version2.files).length > 0) {
    saveStore(version2, storage);
    storage.removeItem(VERSION_2_CONVERSATION_STORAGE_KEY);
    return version2;
  }
  return current;
};

const loadDurableStore = async (): Promise<PersistedConversationStore> => {
  const indexedValue = await storageAdapter.getItem<unknown>(CONVERSATION_STORAGE_KEY, null);
  const indexedStore = migrateConversationStore(indexedValue);
  const localStore = loadStore(window.localStorage);
  const mergedStore: PersistedConversationStore = {
    version: 3,
    files: {
      ...localStore.files,
      ...indexedStore.files,
    },
  };
  const hasLocalOnlyFiles = Object.keys(localStore.files).some((fileId) => (
    !Object.prototype.hasOwnProperty.call(indexedStore.files, fileId)
  ));
  if (hasLocalOnlyFiles) {
    await storageAdapter.setItem(CONVERSATION_STORAGE_KEY, mergedStore);
  }
  return mergedStore;
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

export const loadConversationAsync = async (
  fileId: string,
): Promise<PersistedFileConversation> => {
  const store = await loadDurableStore();
  return store.files[fileId] || createDefaultFileConversation();
};

export const saveConversation = (
  fileId: string,
  conversation: PersistedFileConversation,
  storage: Storage = window.localStorage,
) => {
  let nextStore: PersistedConversationStore | null = null;
  try {
    nextStore = {
      version: 3,
      files: {
        ...loadStore(storage).files,
        [fileId]: {
          activeThreadId: conversation.activeThreadId,
          threads: conversation.threads.map((thread) => ({
            ...thread,
            messages: normalizeMessages(thread.messages),
          })),
        },
      },
    };
    saveStore(nextStore, storage);
    storage.removeItem(durableConversationMarkerKey(fileId));
    storage.removeItem(VERSION_2_CONVERSATION_STORAGE_KEY);
    storage.removeItem(LEGACY_CONVERSATION_STORAGE_KEY);
  } catch {
    if (!nextStore) return;
    try {
      const compactStore: PersistedConversationStore = {
        version: 3,
        files: Object.fromEntries(Object.entries(nextStore.files).map(([storedFileId, storedConversation]) => [
          storedFileId,
          {
            ...storedConversation,
            threads: storedConversation.threads.map((thread) => ({
              ...thread,
              messages: thread.messages.map((message) => ({ ...message, scoreProposals: [] })),
            })),
          },
        ])),
      };
      saveStore(compactStore, storage);
      for (const [storedFileId, storedConversation] of Object.entries(nextStore.files)) {
        if (storedConversation.threads.some((thread) => (
          thread.messages.some((message) => (message.scoreProposals?.length || 0) > 0)
        ))) {
          storage.setItem(durableConversationMarkerKey(storedFileId), '1');
        }
      }
    } catch {
      // Conversation persistence is best-effort in private or quota-limited browsers.
    }
  }
};

export const conversationNeedsDurableHydration = (
  fileId: string,
  storage: Storage = window.localStorage,
): boolean => storage.getItem(durableConversationMarkerKey(fileId)) === '1';

let durableSaveQueue: Promise<boolean> = Promise.resolve(true);

export const saveConversationAsync = (
  fileId: string,
  conversation: PersistedFileConversation,
): Promise<boolean> => {
  durableSaveQueue = durableSaveQueue.then(async () => {
    const store = await loadDurableStore();
    const saved = await storageAdapter.setItem(CONVERSATION_STORAGE_KEY, {
      version: 3,
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
    } satisfies PersistedConversationStore);
    if (!saved) return false;
    await storageAdapter.removeItem(VERSION_2_CONVERSATION_STORAGE_KEY);
    await storageAdapter.removeItem(LEGACY_CONVERSATION_STORAGE_KEY);
    return true;
  }).catch(() => {
    // Conversation persistence remains best-effort when durable browser storage is unavailable.
    return false;
  });
  return durableSaveQueue;
};

export const clearConversation = (
  fileId: string,
  storage: Storage = window.localStorage,
) => {
  try {
    const store = loadStore(storage);
    const nextFiles = { ...store.files };
    delete nextFiles[fileId];
    saveStore({ version: 3, files: nextFiles }, storage);
    storage.removeItem(VERSION_2_CONVERSATION_STORAGE_KEY);
    storage.removeItem(LEGACY_CONVERSATION_STORAGE_KEY);
  } catch {
    // Keep the in-memory conversation usable when storage is unavailable.
  }
};

export const makeEmptyConversation = () => createDefaultFileConversation();
