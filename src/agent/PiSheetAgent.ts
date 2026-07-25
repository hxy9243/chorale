import { Agent, type AgentMessage, type StreamFn } from '@earendil-works/pi-agent-core';
import {
  fauxAssistantMessage,
  fauxText,
  createFauxCore,
} from '@earendil-works/pi-ai/providers/faux';
import type { Context, Message } from '@earendil-works/pi-ai';
import type {
  AgentResponseCallbacks,
  ChatMessage,
  MusicContextSnapshot,
} from './types';

const CONTEXT_START = '[CHORALE_MUSIC_CONTEXT]';
const CONTEXT_END = '[/CHORALE_MUSIC_CONTEXT]';

const contentToText = (content: Message['content']): string => {
  if (typeof content === 'string') return content;
  return content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('');
};

const formatPrompt = (question: string, snapshot: MusicContextSnapshot) => (
  `${CONTEXT_START}\n` +
  `file=${JSON.stringify(snapshot.fileName)}\n` +
  `revision=${snapshot.revision}\n` +
  `capturedAt=${snapshot.capturedAt}\n` +
  `abc:\n${snapshot.abc}\n` +
  `${CONTEXT_END}\n\n` +
  `User question: ${question}`
);

const findHeader = (abc: string, name: string) => {
  const match = abc.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
};

const createGroundedMockReply = (context: Context) => {
  const lastUserMessage = [...context.messages].reverse().find((message) => message.role === 'user');
  const prompt = lastUserMessage ? contentToText(lastUserMessage.content) : '';
  const fileMatch = prompt.match(/^file=("(?:[^"\\]|\\.)*")$/m);
  const revisionMatch = prompt.match(/^revision=(\d+)$/m);
  const abcMatch = prompt.match(/abc:\n([\s\S]*?)\n\[\/CHORALE_MUSIC_CONTEXT\]/);
  const questionMatch = prompt.match(/User question:\s*([\s\S]*)$/);
  const abc = abcMatch?.[1] ?? '';
  const fileName = fileMatch ? JSON.parse(fileMatch[1]) as string : 'the current score';
  const revision = revisionMatch?.[1] ?? '?';
  const title = findHeader(abc, 'T') ?? fileName;
  const key = findHeader(abc, 'K') ?? 'not declared';
  const meter = findHeader(abc, 'M') ?? 'not declared';
  const barLines = abc.match(/\|/g)?.length ?? 0;
  const userTurns = context.messages.filter((message) => message.role === 'user').length;
  const question = questionMatch?.[1]?.trim() ?? '';

  return [
    `I'm using ${title} from ABC revision ${revision}.`,
    `The current notation declares key ${key}, meter ${meter}, and contains about ${barLines} bar-line markers.`,
    question ? `You asked: “${question}”` : '',
    `This is turn ${userTurns} in the saved Pi-agent conversation. The prototype is using a deterministic mock model, so it proves context loading and history without making a paid API call.`,
  ].filter(Boolean).join('\n\n');
};

const toAgentHistory = (messages: ChatMessage[]): AgentMessage[] => messages.flatMap<AgentMessage>((message) => {
  if (!message.content.trim() || message.status === 'error') return [];

  if (message.role === 'user') {
    const content = message.context
      ? formatPrompt(message.content, message.context)
      : message.content;
    return [{ role: 'user', content, timestamp: Date.parse(message.createdAt) } as AgentMessage];
  }

  return [fauxAssistantMessage(fauxText(message.content), {
    timestamp: Date.parse(message.createdAt),
  })];
});

export class PiSheetAgent {
  private activeAgent?: Agent;
  private readonly tokensPerSecond: number;

  constructor(options: { tokensPerSecond?: number } = {}) {
    this.tokensPerSecond = options.tokensPerSecond ?? 48;
  }

  async send(
    history: ChatMessage[],
    question: string,
    snapshot: MusicContextSnapshot,
    callbacks: AgentResponseCallbacks,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) throw new DOMException('The response was stopped.', 'AbortError');

    const faux = createFauxCore({
      api: 'chorale-mock',
      provider: 'chorale-mock',
      models: [{ id: 'current-sheet-tutor', name: 'Current Sheet Tutor' }],
      tokensPerSecond: this.tokensPerSecond,
      tokenSize: { min: 3, max: 9 },
    });
    faux.setResponses([
      (context) => fauxAssistantMessage(createGroundedMockReply(context)),
    ]);

    const agent = new Agent({
      initialState: {
        systemPrompt: [
          'You are Chorale, a read-only music tutor.',
          'Ground every answer in the supplied CHORALE_MUSIC_CONTEXT.',
          'Never claim to have changed the score.',
        ].join(' '),
        model: faux.getModel(),
        thinkingLevel: 'off',
        messages: toAgentHistory(history),
        tools: [],
      },
      streamFn: faux.streamSimple as StreamFn,
    });
    this.activeAgent = agent;
    let response = '';

    const unsubscribe = agent.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta' &&
        !signal.aborted
      ) {
        response += event.assistantMessageEvent.delta;
        callbacks.onDelta(event.assistantMessageEvent.delta);
      }
    });

    const abort = () => agent.abort();
    signal.addEventListener('abort', abort, { once: true });

    try {
      await agent.prompt(formatPrompt(question, snapshot));
      if (signal.aborted) throw new DOMException('The response was stopped.', 'AbortError');
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
      return response;
    } finally {
      signal.removeEventListener('abort', abort);
      unsubscribe();
      if (this.activeAgent === agent) this.activeAgent = undefined;
    }
  }

  abort() {
    this.activeAgent?.abort();
  }
}
