import type {
  ChatMessage,
  ChatMessagePart,
  ChatThread,
  PersistedConversationStore,
  PersistedFileConversation,
  QueuedChatMessage,
  RoundUsage,
} from './types';
import type { AgentProfileId } from '../types/document';
import { validateAnnotationProposal, validateScoreChangeProposal } from '../music/documentSchema';
import { storageAdapter } from '../utils/storageAdapter';

export const LEGACY_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v1';
export const VERSION_2_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v2';
export const VERSION_3_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v3';
export const VERSION_4_CONVERSATION_STORAGE_KEY = 'chorale.pi-agent-conversation.v4';
export const CONVERSATION_STORAGE_KEY = VERSION_4_CONVERSATION_STORAGE_KEY;
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

export const parseLegacyThinkingMarkup = (
  content: string,
  isInterrupted = false,
): ChatMessagePart[] => {
  const parts: ChatMessagePart[] = [];
  const lowerContent = content.toLowerCase();
  const startTag = '<think>';
  const endTag = '</think>';
  let cursor = 0;

  while (cursor < content.length) {
    const start = lowerContent.indexOf(startTag, cursor);
    if (start < 0) {
      const remaining = content.slice(cursor);
      if (remaining.length > 0) {
        parts.push({ type: 'text', text: remaining });
      }
      break;
    }

    if (start > cursor) {
      const preceding = content.slice(cursor, start);
      if (preceding.length > 0) {
        parts.push({ type: 'text', text: preceding });
      }
    }

    const thinkingStart = start + startTag.length;
    const end = lowerContent.indexOf(endTag, thinkingStart);
    if (end < 0) {
      const thinkingText = content.slice(thinkingStart);
      if (thinkingText.length > 0) {
        parts.push({
          type: 'reasoning',
          text: thinkingText,
          status: isInterrupted ? 'stopped' : 'complete',
        });
      }
      cursor = content.length;
      break;
    }

    const thinkingText = content.slice(thinkingStart, end);
    if (thinkingText.length > 0) {
      parts.push({
        type: 'reasoning',
        text: thinkingText,
        status: 'complete',
      });
    }
    cursor = end + endTag.length;
  }

  if (parts.length === 0 && content.length > 0) {
    parts.push({ type: 'text', text: content });
  }

  return parts;
};

const isRoundUsage = (value: unknown): value is RoundUsage => {
  if (!value || typeof value !== 'object') return false;
  const u = value as Partial<RoundUsage>;
  return (
    typeof u.input === 'number' &&
    typeof u.output === 'number' &&
    typeof u.cacheRead === 'number' &&
    typeof u.cacheWrite === 'number' &&
    typeof u.totalTokens === 'number'
  );
};

const mergeConsecutiveParts = (parts: ChatMessagePart[]): ChatMessagePart[] => {
  const merged: ChatMessagePart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'reasoning' && part.type === 'reasoning') {
      last.text += part.text;
      if (part.status === 'streaming') last.status = 'streaming';
    } else if (last && last.type === 'text' && part.type === 'text') {
      last.text += part.text;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
};

const normalizeParts = (
  parts: unknown,
  fallbackContent: string,
  isInterrupted: boolean,
  toolDisplays?: unknown,
): ChatMessagePart[] => {
  if (Array.isArray(parts) && parts.length > 0) {
    const raw = parts.flatMap((part): ChatMessagePart[] => {
      if (!part || typeof part !== 'object') return [];
      const p = part as Record<string, unknown>;
      if (p.type === 'text' && typeof p.text === 'string') {
        return [{ type: 'text', text: p.text }];
      }
      if (p.type === 'reasoning' && typeof p.text === 'string') {
        return [{
          type: 'reasoning',
          text: p.text,
          status: p.status === 'streaming' || isInterrupted ? 'stopped' : (p.status as any ?? 'complete'),
        }];
      }
      if (
        p.type === 'tool' &&
        typeof p.toolCallId === 'string' &&
        typeof p.toolName === 'string' &&
        typeof p.summary === 'string' &&
        ['running', 'success', 'error'].includes(String(p.status))
      ) {
        return [{
          type: 'tool',
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          summary: p.summary,
          status: p.status as 'running' | 'success' | 'error',
          ...(typeof p.durationMs === 'number' ? { durationMs: p.durationMs } : {}),
          ...(typeof p.startTime === 'string' ? { startTime: p.startTime } : {}),
          ...(typeof p.endTime === 'string' ? { endTime: p.endTime } : {}),
        }];
      }
      return [];
    });
    return mergeConsecutiveParts(raw);
  }

  const result: ChatMessagePart[] = [];
  if (Array.isArray(toolDisplays)) {
    for (const tool of toolDisplays) {
      if (
        tool &&
        typeof tool === 'object' &&
        typeof tool.toolCallId === 'string' &&
        typeof tool.toolName === 'string' &&
        typeof tool.summary === 'string' &&
        ['running', 'success', 'error'].includes(String(tool.status))
      ) {
        result.push({
          type: 'tool',
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          summary: tool.summary,
          status: tool.status as 'running' | 'success' | 'error',
          ...(typeof tool.durationMs === 'number' ? { durationMs: tool.durationMs } : {}),
          ...(typeof tool.startTime === 'string' ? { startTime: tool.startTime } : {}),
          ...(typeof tool.endTime === 'string' ? { endTime: tool.endTime } : {}),
        });
      }
    }
  }
  result.push(...parseLegacyThinkingMarkup(fallbackContent, isInterrupted));
  return mergeConsecutiveParts(result);
};

const isQueuedChatMessage = (value: unknown): value is QueuedChatMessage => {
  if (!value || typeof value !== 'object') return false;
  const q = value as Partial<QueuedChatMessage>;
  return (
    typeof q.id === 'string' &&
    typeof q.prompt === 'string' &&
    (q.lane === 'queue' || q.lane === 'steer') &&
    typeof q.createdAt === 'string' &&
    q.context !== undefined &&
    typeof q.context === 'object'
  );
};

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
  messages.filter(isChatMessage).map((message) => {
    const isInterrupted = message.status === 'streaming';
    const status = isInterrupted ? 'stopped' : message.status;
    const parts = normalizeParts(message.parts, message.content, isInterrupted, message.toolDisplays);
    return {
      ...message,
      status,
      parts,
      usage: isRoundUsage(message.usage) ? { ...message.usage } : undefined,
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
              ? [{
                  ...tool,
                  ...(typeof tool.durationMs === 'number' ? { durationMs: tool.durationMs } : {}),
                  ...(typeof tool.startTime === 'string' ? { startTime: tool.startTime } : {}),
                  ...(typeof tool.endTime === 'string' ? { endTime: tool.endTime } : {}),
                }]
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
    };
  })
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
  pendingMessages: [],
});

const createDefaultFileConversation = (): PersistedFileConversation => {
  const thread = createEmptyThread();
  return {
    activeThreadId: thread.id,
    threads: [thread],
  };
};

export const getConversationTotalTokens = (thread: ChatThread): number => (
  thread.messages.reduce((total, message) => total + (message.usage?.totalTokens ?? 0), 0)
);

export const migrateConversationStore = (value: unknown): PersistedConversationStore => {
  if (!value || typeof value !== 'object') return { version: 4, files: {} };
  const parsed = value as { version?: unknown; files?: unknown };
  if (
    (parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4)
    || !parsed.files
    || typeof parsed.files !== 'object'
    || Array.isArray(parsed.files)
  ) {
    return { version: 4, files: {} };
  }

  const files = Object.fromEntries(
    Object.entries(parsed.files).flatMap(([fileId, fileValue]) => {
      if (!fileValue || typeof fileValue !== 'object') return [];
      const fileConversation = fileValue as Partial<PersistedFileConversation>;
      if (!Array.isArray(fileConversation.threads)) return [];

      const threads = fileConversation.threads.filter(isChatThread).map((thread) => ({
        ...thread,
        messages: normalizeMessages(thread.messages),
        pendingMessages: Array.isArray(thread.pendingMessages)
          ? thread.pendingMessages.flatMap((item) => {
              const validated = isQueuedChatMessage(item) ? item : null;
              if (!validated) return [];
              // Restored items normalize to ordinary FIFO queue (lane: 'queue') and never auto-run
              return [{ ...validated, lane: 'queue' as const }];
            })
          : [],
      }));
      if (threads.length === 0) return [];

      const activeThreadId = threads.some((thread) => thread.id === fileConversation.activeThreadId)
        ? fileConversation.activeThreadId as string
        : threads[0].id;

      return [[fileId, { activeThreadId, threads }]];
    }),
  );
  return { version: 4, files };
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
  const v4 = migrateConversationStore(parseStored(storage.getItem(VERSION_4_CONVERSATION_STORAGE_KEY)));
  const v3 = migrateConversationStore(parseStored(storage.getItem(VERSION_3_CONVERSATION_STORAGE_KEY)));
  const v2 = migrateConversationStore(parseStored(storage.getItem(VERSION_2_CONVERSATION_STORAGE_KEY)));

  const mergedFiles: Record<string, PersistedFileConversation> = { ...v2.files };
  for (const [fileId, fileConv] of Object.entries(v3.files)) {
    mergedFiles[fileId] = fileConv;
  }
  for (const [fileId, fileConv] of Object.entries(v4.files)) {
    const v3File = v3.files[fileId];
    const v4HasMessages = fileConv.threads.some((t) => t.messages.length > 0);
    const v3HasMessages = v3File?.threads.some((t) => t.messages.length > 0);
    if (!v4HasMessages && v3HasMessages) {
      mergedFiles[fileId] = v3File;
    } else {
      mergedFiles[fileId] = fileConv;
    }
  }

  return {
    version: 4,
    files: mergedFiles,
  };
};

const loadDurableStore = async (): Promise<PersistedConversationStore> => {
  const indexedV4 = await storageAdapter.getItem<unknown>(VERSION_4_CONVERSATION_STORAGE_KEY, null);
  let indexedStore = migrateConversationStore(indexedV4);

  if (Object.keys(indexedStore.files).length === 0) {
    const indexedV3 = await storageAdapter.getItem<unknown>(VERSION_3_CONVERSATION_STORAGE_KEY, null);
    const migratedV3 = migrateConversationStore(indexedV3);
    if (Object.keys(migratedV3.files).length > 0) {
      indexedStore = migratedV3;
      await storageAdapter.setItem(VERSION_4_CONVERSATION_STORAGE_KEY, indexedStore);
      // Keep v3 in IndexedDB intact for rollback
    }
  }

  const localStore = loadStore(window.localStorage);
  const mergedStore: PersistedConversationStore = {
    version: 4,
    files: {
      ...localStore.files,
      ...indexedStore.files,
    },
  };
  const hasLocalOnlyFiles = Object.keys(localStore.files).some((fileId) => (
    !Object.prototype.hasOwnProperty.call(indexedStore.files, fileId)
  ));
  if (hasLocalOnlyFiles) {
    await storageAdapter.setItem(VERSION_4_CONVERSATION_STORAGE_KEY, mergedStore);
  }
  return mergedStore;
};

const saveStore = (
  store: PersistedConversationStore,
  storage: Storage,
) => {
  const serialized = JSON.stringify(store);
  storage.setItem(VERSION_4_CONVERSATION_STORAGE_KEY, serialized);
  storage.setItem(VERSION_3_CONVERSATION_STORAGE_KEY, serialized);
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
  if (!storage.getItem(VERSION_4_CONVERSATION_STORAGE_KEY) && (storage.getItem(VERSION_3_CONVERSATION_STORAGE_KEY) || storage.getItem(VERSION_2_CONVERSATION_STORAGE_KEY))) {
    saveStore(store, storage);
  }
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
        pendingMessages: [],
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
      version: 4,
      files: {
        ...loadStore(storage).files,
        [fileId]: {
          activeThreadId: conversation.activeThreadId,
          threads: conversation.threads.map((thread) => ({
            ...thread,
            messages: normalizeMessages(thread.messages),
            pendingMessages: Array.isArray(thread.pendingMessages)
              ? thread.pendingMessages.filter(isQueuedChatMessage)
              : [],
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
        version: 4,
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

export const savePendingQueue = (
  fileId: string,
  threadId: string,
  pendingMessages: QueuedChatMessage[],
  storage: Storage = window.localStorage,
) => {
  try {
    const store = loadStore(storage);
    const existingFile = store.files[fileId] ?? createDefaultFileConversation();
    const nextThreads = existingFile.threads.map((thread) => (
      thread.id === threadId
        ? { ...thread, pendingMessages: pendingMessages.filter(isQueuedChatMessage) }
        : thread
    ));
    const nextStore: PersistedConversationStore = {
      version: 4,
      files: {
        ...store.files,
        [fileId]: { ...existingFile, threads: nextThreads },
      },
    };
    saveStore(nextStore, storage);
  } catch {
    // Best-effort in quota-limited browsers
  }
};

let durableSaveQueue: Promise<boolean> = Promise.resolve(true);

export const savePendingQueueAsync = (
  fileId: string,
  threadId: string,
  pendingMessages: QueuedChatMessage[],
): Promise<boolean> => {
  durableSaveQueue = durableSaveQueue.then(async () => {
    const store = await loadDurableStore();
    const existingFile = store.files[fileId] ?? createDefaultFileConversation();
    const nextThreads = existingFile.threads.map((thread) => (
      thread.id === threadId
        ? { ...thread, pendingMessages: pendingMessages.filter(isQueuedChatMessage) }
        : thread
    ));
    const saved = await storageAdapter.setItem(VERSION_4_CONVERSATION_STORAGE_KEY, {
      version: 4,
      files: {
        ...store.files,
        [fileId]: { ...existingFile, threads: nextThreads },
      },
    } satisfies PersistedConversationStore);
    return Boolean(saved);
  }).catch(() => false);
  return durableSaveQueue;
};

export const conversationNeedsDurableHydration = (
  fileId: string,
  storage: Storage = window.localStorage,
): boolean => storage.getItem(durableConversationMarkerKey(fileId)) === '1';

export const saveConversationAsync = (
  fileId: string,
  conversation: PersistedFileConversation,
): Promise<boolean> => {
  durableSaveQueue = durableSaveQueue.then(async () => {
    const store = await loadDurableStore();
    const saved = await storageAdapter.setItem(VERSION_4_CONVERSATION_STORAGE_KEY, {
      version: 4,
      files: {
        ...store.files,
        [fileId]: {
          activeThreadId: conversation.activeThreadId,
          threads: conversation.threads.map((thread) => ({
            ...thread,
            messages: normalizeMessages(thread.messages),
            pendingMessages: Array.isArray(thread.pendingMessages)
              ? thread.pendingMessages.filter(isQueuedChatMessage)
              : [],
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
    saveStore({ version: 4, files: nextFiles }, storage);
    storage.removeItem(VERSION_2_CONVERSATION_STORAGE_KEY);
    storage.removeItem(LEGACY_CONVERSATION_STORAGE_KEY);
  } catch {
    // Keep the in-memory conversation usable when storage is unavailable.
  }
};

export const makeEmptyConversation = () => createDefaultFileConversation();
