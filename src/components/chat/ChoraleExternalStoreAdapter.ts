import type {
  AppendMessage,
  ExternalStoreAdapter,
  ThreadMessageLike,
} from '@assistant-ui/react';
import type { ChatMessage } from '../../agent/types';

export const convertChoraleMessageToThreadMessageLike = (
  message: ChatMessage,
): ThreadMessageLike => {
  const isUser = message.role === 'user';
  if (isUser) {
    return {
      role: 'user',
      id: message.id,
      createdAt: new Date(message.createdAt),
      content: message.content,
      metadata: {
        custom: {
          context: message.context,
          originalMessage: message,
        },
      },
    };
  }

  const parts: any[] = [];
  if (message.parts && message.parts.length > 0) {
    for (const part of message.parts) {
      const last = parts[parts.length - 1];
      if (part.type === 'text') {
        if (last && last.type === 'text') {
          last.text += part.text;
        } else {
          parts.push({ type: 'text', text: part.text });
        }
      } else if (part.type === 'reasoning') {
        if (last && last.type === 'reasoning') {
          last.text += part.text;
        } else {
          parts.push({ type: 'reasoning', text: part.text });
        }
      } else if (part.type === 'tool') {
        parts.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: {},
          result: part.summary,
        });
      }
    }
  } else {
    parts.push({ type: 'text', text: message.content });
  }

  return {
    role: 'assistant',
    id: message.id,
    createdAt: new Date(message.createdAt),
    status: message.status === 'streaming'
      ? { type: 'running' }
      : message.status === 'complete'
        ? { type: 'complete', reason: 'stop' }
        : { type: 'incomplete', reason: message.status === 'error' ? 'error' : 'cancelled' },
    content: parts as unknown as ThreadMessageLike['content'],
    metadata: {
      custom: {
        profileRoutes: message.profileRoutes,
        toolDisplays: message.toolDisplays,
        proposals: message.proposals,
        scoreProposals: message.scoreProposals,
        usage: message.usage,
        provider: message.provider,
        originalMessage: message,
      },
    },
  };
};

export interface ChoraleExternalStoreOptions {
  messages: ChatMessage[];
  isRunning: boolean;
  onNew: (message: AppendMessage) => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
  queue?: any;
}

export const createChoraleExternalStoreAdapter = ({
  messages,
  isRunning,
  onNew,
  onCancel,
  queue,
}: ChoraleExternalStoreOptions): ExternalStoreAdapter<ChatMessage> => ({
  messages,
  isRunning,
  convertMessage: (msg: ChatMessage) => convertChoraleMessageToThreadMessageLike(msg),
  onNew: async (msg: AppendMessage) => {
    await onNew(msg);
  },
  onCancel: async () => {
    await onCancel?.();
  },
  queue,
});
