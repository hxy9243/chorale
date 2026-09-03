import type { AppendMessage, QueueItemState } from '@assistant-ui/react';
import type { MusicContextSnapshot, QueuedChatMessage } from '../../agent/types';
import { savePendingQueue, savePendingQueueAsync } from '../../agent/conversationStore';

export type QueuePlacement = {
  readonly lane?: 'queue' | 'steer';
  readonly insertAfter?: string | null;
  readonly insertBefore?: string | null;
};

export type ExternalThreadQueueAdapter = {
  items: readonly QueueItemState[];
  steerItems: readonly QueueItemState[];
  enqueue: (message: any) => void;
  steer: (message: any) => void;
  move: (queueItemId: string, placement: QueuePlacement) => void;
  edit: (queueItemId: string, message: any) => void;
  remove: (queueItemId: string) => void;
  __internal_setDispatchTransform?: ((transform: (message: AppendMessage) => AppendMessage) => void) | undefined;
  __internal_notifyCancelled?: (() => void) | undefined;
};

const getAppendMessageText = (msg: AppendMessage): string => {
  if (typeof (msg as any).content === 'string') return (msg as any).content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
  }
  return '';
};

export const toQueueItemState = (item: QueuedChatMessage): QueueItemState => ({
  id: item.id,
  prompt: item.prompt,
  parts: [{ type: 'text', text: item.prompt }],
});

export interface ChoraleQueueOptions {
  fileId: string;
  threadId: string;
  pendingMessages: QueuedChatMessage[];
  onQueueChange: (nextQueue: QueuedChatMessage[]) => void;
  getMusicContext: () => MusicContextSnapshot;
}

export const createChoraleQueueAdapter = ({
  fileId,
  threadId,
  pendingMessages,
  onQueueChange,
  getMusicContext,
}: ChoraleQueueOptions): ExternalThreadQueueAdapter & {
  rawItems: QueuedChatMessage[];
  runNext: (itemId?: string) => QueuedChatMessage | null;
  reorder: (itemId: string, direction: 'up' | 'down') => void;
} => {
  const persistAndNotify = (next: QueuedChatMessage[]) => {
    onQueueChange(next);
    if (fileId && threadId) {
      savePendingQueue(fileId, threadId, next);
      void savePendingQueueAsync(fileId, threadId, next);
    }
  };

  const enqueueItem = (prompt: string, lane: 'queue' | 'steer') => {
    const newItem: QueuedChatMessage = {
      id: `queue-${crypto.randomUUID()}`,
      prompt,
      lane,
      createdAt: new Date().toISOString(),
      context: getMusicContext(),
    };
    persistAndNotify([...pendingMessages, newItem]);
  };

  const queueItems = pendingMessages.filter((m) => m.lane === 'queue').map(toQueueItemState);
  const steerItems = pendingMessages.filter((m) => m.lane === 'steer').map(toQueueItemState);

  return {
    items: queueItems,
    steerItems,
    rawItems: pendingMessages,

    enqueue: (message: AppendMessage) => {
      const text = getAppendMessageText(message);
      if (!text.trim()) return;
      enqueueItem(text.trim(), 'queue');
    },

    steer: (message: AppendMessage) => {
      const text = getAppendMessageText(message);
      if (!text.trim()) return;
      enqueueItem(text.trim(), 'steer');
    },

    move: (queueItemId: string, placement: QueuePlacement) => {
      const targetIndex = pendingMessages.findIndex((m) => m.id === queueItemId);
      if (targetIndex < 0) return;
      const item = pendingMessages[targetIndex];
      const nextLane = placement.lane ?? item.lane;
      const updatedItem = { ...item, lane: nextLane };

      const remaining = pendingMessages.filter((m) => m.id !== queueItemId);
      let insertIndex = remaining.length;

      if (placement.insertBefore) {
        const idx = remaining.findIndex((m) => m.id === placement.insertBefore);
        if (idx >= 0) insertIndex = idx;
      } else if (placement.insertAfter) {
        const idx = remaining.findIndex((m) => m.id === placement.insertAfter);
        if (idx >= 0) insertIndex = idx + 1;
      }

      const next = [...remaining];
      next.splice(insertIndex, 0, updatedItem);
      persistAndNotify(next);
    },

    edit: (queueItemId: string, message: AppendMessage) => {
      const text = getAppendMessageText(message).trim();
      if (!text) return;
      const next = pendingMessages.map((m) => (
        m.id === queueItemId ? { ...m, prompt: text } : m
      ));
      persistAndNotify(next);
    },

    remove: (queueItemId: string) => {
      const next = pendingMessages.filter((m) => m.id !== queueItemId);
      persistAndNotify(next);
    },

    reorder: (itemId: string, direction: 'up' | 'down') => {
      const index = pendingMessages.findIndex((m) => m.id === itemId);
      if (index < 0) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= pendingMessages.length) return;

      const next = [...pendingMessages];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      persistAndNotify(next);
    },

    runNext: (itemId?: string): QueuedChatMessage | null => {
      if (pendingMessages.length === 0) return null;
      let pickIdx = -1;
      if (itemId) {
        pickIdx = pendingMessages.findIndex((m) => m.id === itemId);
        if (pickIdx < 0) return null;
      } else {
        // FIFO selection: pick first steer item if any, otherwise first queue item
        const steerIdx = pendingMessages.findIndex((m) => m.lane === 'steer');
        pickIdx = steerIdx >= 0 ? steerIdx : 0;
      }
      const item = pendingMessages[pickIdx];
      if (!item) return null;
      const next = pendingMessages.filter((_, idx) => idx !== pickIdx);
      persistAndNotify(next);
      return item;
    },
  };
};
