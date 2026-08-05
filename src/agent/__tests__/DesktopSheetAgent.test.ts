import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopSheetAgent } from '../DesktopSheetAgent';
import type { AIEvent, ChoraleAIBridge, SheetAgentRequest } from '../aiTypes';

const request: SheetAgentRequest = {
  history: [],
  question: 'What is the cadence?',
  context: {
    id: 'context-1',
    documentId: 'document-1',
    revision: 2,
    capturedAt: '2026-07-29T12:00:00.000Z',
    fileName: 'Cadence.abc',
    abc: 'X:1\nK:C\nCDEF|GABc|',
    annotations: [],
  },
};

const makeBridge = () => {
  const listeners = new Set<(event: AIEvent) => void>();
  const bridge = {
    onAIEvent: vi.fn((listener: (event: AIEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    sendChat: vi.fn(async () => ({ requestId: 'request-1' })),
    abortChat: vi.fn(async () => undefined),
  } as unknown as ChoraleAIBridge;
  return {
    bridge,
    listeners,
    emit: (event: AIEvent) => {
      for (const listener of listeners) listener(event);
    },
  };
};

afterEach(() => {
  delete window.choraleAI;
});

describe('DesktopSheetAgent', () => {
  it('buffers early IPC events, streams deltas, and removes its listener', async () => {
    const fake = makeBridge();
    window.choraleAI = fake.bridge;
    vi.mocked(fake.bridge.sendChat).mockImplementation(async () => {
      fake.emit({
        type: 'chat-start',
        requestId: 'request-1',
        connectionId: 'connection-1',
        modelId: 'model-1',
        providerKind: 'openai',
      });
      fake.emit({ type: 'chat-delta', requestId: 'request-1', text: 'Grounded answer' });
      fake.emit({ type: 'chat-done', requestId: 'request-1' });
      return { requestId: 'request-1' };
    });
    const onDelta = vi.fn();
    const onStart = vi.fn();

    await new DesktopSheetAgent().send(
      request,
      { onDelta, onStart },
      new AbortController().signal,
    );

    expect(onDelta).toHaveBeenCalledWith('Grounded answer');
    expect(onStart).toHaveBeenCalledWith({
      connectionId: 'connection-1',
      providerKind: 'openai',
      modelId: 'model-1',
    });
    expect(fake.listeners.size).toBe(0);
  });

  it('aborts the main-process request and rejects with AbortError', async () => {
    const fake = makeBridge();
    window.choraleAI = fake.bridge;
    vi.mocked(fake.bridge.abortChat).mockImplementation(async (requestId) => {
      fake.emit({
        type: 'chat-error',
        requestId,
        code: 'aborted',
        message: 'Stopped',
      });
    });
    const controller = new AbortController();
    const sending = new DesktopSheetAgent().send(
      request,
      { onDelta: vi.fn(), onStart: vi.fn() },
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();

    await expect(sending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.bridge.abortChat).toHaveBeenCalledWith('request-1');
    expect(fake.listeners.size).toBe(0);
  });

  it('reports desktop-required state without a preload bridge', async () => {
    await expect(new DesktopSheetAgent().send(
      request,
      { onDelta: vi.fn(), onStart: vi.fn() },
      new AbortController().signal,
    )).rejects.toThrow('desktop app');
  });
});
