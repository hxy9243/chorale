import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  Usage,
} from '@earendil-works/pi-ai';
import type { ChatMessage, MusicContextSnapshot } from './types';

const CONTEXT_START = '[CHORALE_MUSIC_CONTEXT]';
const CONTEXT_END = '[/CHORALE_MUSIC_CONTEXT]';

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export const formatPrompt = (question: string, snapshot: MusicContextSnapshot): string => (
  `${CONTEXT_START}\n` +
  `file=${JSON.stringify(snapshot.fileName)}\n` +
  `revision=${snapshot.revision}\n` +
  `capturedAt=${snapshot.capturedAt}\n` +
  (snapshot.selection
    ? `selection=${JSON.stringify(snapshot.selection)}\n`
    : '') +
  `abc:\n${snapshot.abc}\n` +
  `${CONTEXT_END}\n\n` +
  `User question: ${question}`
);

const assistantHistoryMessage = (
  message: ChatMessage,
  model: Model<Api>,
): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: message.content }],
  api: model.api,
  provider: model.provider,
  model: model.id,
  usage: EMPTY_USAGE,
  stopReason: message.status === 'stopped' ? 'aborted' : 'stop',
  timestamp: Date.parse(message.createdAt),
});

export const toAgentHistory = (messages: ChatMessage[], model: Model<Api>): AgentMessage[] => (
  messages.flatMap<AgentMessage>((message) => {
    if (!message.content.trim() || message.status === 'error' || message.status === 'streaming') {
      return [];
    }
    if (message.role === 'user') {
      const content = message.context
        ? formatPrompt(message.content, message.context)
        : message.content;
      return [{ role: 'user', content, timestamp: Date.parse(message.createdAt) } as Message];
    }
    return [assistantHistoryMessage(message, model)];
  })
);
