import type { AIEvent, AIProviderKind, SheetAgentRequest } from './aiTypes';

export type ChatProvenance = {
  connectionId: string;
  providerKind: AIProviderKind;
  modelId: string;
};

type SendCallbacks = {
  onDelta(delta: string): void;
  onStart(provenance: ChatProvenance): void;
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
    const buffered: AIEvent[] = [];
    const completion = new Promise<void>((resolve, rejectPromise) => {
      settle = resolve;
      reject = rejectPromise;
    });

    const consume = (event: AIEvent) => {
      if (!('requestId' in event) || event.requestId !== requestId) return;
      if (event.type === 'chat-start') {
        callbacks.onStart({
          connectionId: event.connectionId,
          providerKind: event.providerKind,
          modelId: event.modelId,
        });
      } else if (event.type === 'chat-delta') {
        callbacks.onDelta(event.text);
      } else if (event.type === 'chat-done') {
        settle?.();
      } else if (event.type === 'chat-error') {
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
