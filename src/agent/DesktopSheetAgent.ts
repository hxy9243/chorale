import type { AIEvent, AIProviderKind, SheetAgentRequest } from './aiTypes';
import type { AgentProfileId, AnnotationProposal } from '../types/document';
import type { ChatToolDisplay } from './types';

export type ChatProvenance = {
  connectionId: string;
  providerKind: AIProviderKind;
  modelId: string;
};

export type SendCallbacks = {
  onDelta(delta: string): void;
  onStart(provenance: ChatProvenance): void;
  onProfileRoute?(profiles: AgentProfileId[]): void;
  onToolStart?(tool: ChatToolDisplay): void;
  onToolDone?(tool: ChatToolDisplay): void;
  onProposalCreated?(proposal: AnnotationProposal): void;
};

export class DesktopSheetAgent {
  async send(
    request: SheetAgentRequest,
    callbacks: SendCallbacks,
    signal: AbortSignal,
  ): Promise<void> {
    const bridge = window.choraleAI;
    if (!bridge) throw new Error('AI providers require the Chorale desktop app.');
    if (signal.aborted) throw new DOMException('The response was stopped.', 'AbortError');

    let requestId: string | null = null;
    let settle: (() => void) | null = null;
    let reject: ((error: Error) => void) | null = null;
    let finished = false;
    const buffered: AIEvent[] = [];
    const completion = new Promise<void>((resolve, rejectPromise) => {
      settle = resolve;
      reject = rejectPromise;
    });

    const consume = (event: AIEvent) => {
      if (finished || !('requestId' in event) || event.requestId !== requestId) return;
      if (signal.aborted && event.type !== 'chat-error') return;
      if (event.type === 'chat-start') {
        callbacks.onStart({
          connectionId: event.connectionId,
          providerKind: event.providerKind,
          modelId: event.modelId,
        });
      } else if (event.type === 'chat-delta') {
        callbacks.onDelta(event.text);
      } else if (event.type === 'profile-route') {
        callbacks.onProfileRoute?.(event.profiles);
      } else if (event.type === 'tool-start') {
        callbacks.onToolStart?.({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: 'running',
          summary: event.summary,
        });
      } else if (event.type === 'tool-done') {
        callbacks.onToolDone?.({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: event.status,
          summary: event.summary,
        });
      } else if (event.type === 'proposal-created') {
        callbacks.onProposalCreated?.(event.proposal);
      } else if (event.type === 'chat-done') {
        finished = true;
        settle?.();
      } else if (event.type === 'chat-error') {
        finished = true;
        reject?.(event.code === 'aborted'
          ? new DOMException(event.message, 'AbortError')
          : new Error(event.message));
      }
    };
    const unsubscribe = bridge.onAIEvent((event) => {
      if (!requestId) {
        buffered.push(event);
      } else {
        consume(event);
      }
    });
    const abort = () => {
      if (requestId) void bridge.abortChat(requestId);
    };
    signal.addEventListener('abort', abort, { once: true });

    try {
      const started = await bridge.sendChat(request);
      requestId = started.requestId;
      for (const event of buffered) consume(event);
      if (signal.aborted) {
        await bridge.abortChat(requestId);
      }
      await completion;
    } finally {
      signal.removeEventListener('abort', abort);
      unsubscribe();
    }
  }
}
