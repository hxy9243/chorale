import type {
  AIEvent,
  AIProviderKind,
  SheetAgentRequest,
  SheetAgentSteerRequest,
} from './aiTypes';
import type { AgentProfileId, AnnotationProposal, ScoreChangeProposal } from '../types/document';
import type { ChatToolDisplay, RoundUsage } from './types';

export type ChatProvenance = {
  connectionId: string;
  providerKind: AIProviderKind;
  modelId: string;
};

export type SendCallbacks = {
  onDelta(delta: string, partType?: 'text' | 'reasoning', partId?: string): void;
  onStart(provenance: ChatProvenance): void;
  onRequestId?(requestId: string): void;
  onProfileRoute?(profiles: AgentProfileId[]): void;
  onToolStart?(tool: ChatToolDisplay): void;
  onToolDone?(tool: ChatToolDisplay): void;
  onProposalCreated?(proposal: AnnotationProposal): void;
  onScoreProposalCreated?(proposal: ScoreChangeProposal): void;
  onSteerAccepted?(messageId: string): void;
  onDone?(usage?: RoundUsage): void;
};

export class DesktopSheetAgent {
  async steer(requestId: string, steer: SheetAgentSteerRequest): Promise<{ steered: boolean }> {
    const bridge = window.choraleAI;
    if (!bridge) return { steered: false };
    return bridge.steerChat(requestId, steer);
  }

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
        callbacks.onRequestId?.(event.requestId);
        callbacks.onStart({
          connectionId: event.connectionId,
          providerKind: event.providerKind,
          modelId: event.modelId,
        });
      } else if (event.type === 'chat-delta') {
        if (event.partType !== undefined || event.partId !== undefined) {
          callbacks.onDelta(event.text, event.partType, event.partId);
        } else {
          callbacks.onDelta(event.text);
        }
      } else if (event.type === 'profile-route') {
        callbacks.onProfileRoute?.(event.profiles);
      } else if (event.type === 'tool-start') {
        callbacks.onToolStart?.({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: 'running',
          summary: event.summary,
          startTime: event.startTime,
        });
      } else if (event.type === 'tool-done') {
        callbacks.onToolDone?.({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: event.status,
          summary: event.summary,
          durationMs: event.durationMs,
          endTime: event.endTime,
        });
      } else if (event.type === 'proposal-created') {
        callbacks.onProposalCreated?.(event.proposal);
      } else if (event.type === 'score-proposal-created') {
        callbacks.onScoreProposalCreated?.(event.proposal);
      } else if (event.type === 'steer-accepted') {
        callbacks.onSteerAccepted?.(event.messageId);
      } else if (event.type === 'chat-done') {
        finished = true;
        if (event.usage) {
          callbacks.onDone?.(event.usage);
        } else {
          callbacks.onDone?.();
        }
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
      callbacks.onRequestId?.(requestId);
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
