import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopSheetAgent } from '../DesktopSheetAgent';
import type { AIEvent, ChoraleAIBridge, SheetAgentRequest } from '../aiTypes';

const request: SheetAgentRequest = {
  history: [],
  question: 'What is the cadence?',
  thinkingLevel: 'off',
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
      fake.emit({ type: 'chat-delta', requestId: 'request-1', text: 'Late answer' });
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

  it('correlates concurrent same-name tool calls by Pi toolCallId', async () => {
    const fake = makeBridge();
    window.choraleAI = fake.bridge;
    vi.mocked(fake.bridge.sendChat).mockImplementation(async () => {
      fake.emit({
        type: 'profile-route',
        requestId: 'request-1',
        profiles: ['harmony', 'voice-leading'],
      });
      fake.emit({
        type: 'tool-start',
        requestId: 'request-1',
        toolCallId: 'range-a',
        toolName: 'read_measure_range',
        summary: 'Reading mm. 1–2',
      });
      fake.emit({
        type: 'tool-start',
        requestId: 'request-1',
        toolCallId: 'range-b',
        toolName: 'read_measure_range',
        summary: 'Reading mm. 3–4',
      });
      fake.emit({
        type: 'tool-done',
        requestId: 'request-1',
        toolCallId: 'range-b',
        toolName: 'read_measure_range',
        status: 'success',
        summary: 'Read 2 measures',
      });
      fake.emit({
        type: 'tool-done',
        requestId: 'request-1',
        toolCallId: 'range-a',
        toolName: 'read_measure_range',
        status: 'error',
        summary: 'Tool could not complete',
      });
      fake.emit({ type: 'chat-done', requestId: 'request-1' });
      fake.emit({
        type: 'tool-start',
        requestId: 'request-1',
        toolCallId: 'late-range',
        toolName: 'read_measure_range',
        summary: 'Late tool',
      });
      return { requestId: 'request-1' };
    });
    const onProfileRoute = vi.fn();
    const onToolStart = vi.fn();
    const onToolDone = vi.fn();

    await new DesktopSheetAgent().send(
      request,
      {
        onDelta: vi.fn(),
        onStart: vi.fn(),
        onProfileRoute,
        onToolStart,
        onToolDone,
      },
      new AbortController().signal,
    );

    expect(onProfileRoute).toHaveBeenCalledWith(['harmony', 'voice-leading']);
    expect(onToolStart.mock.calls.map(([tool]) => tool.toolCallId)).toEqual(['range-a', 'range-b']);
    expect(onToolDone.mock.calls.map(([tool]) => [tool.toolCallId, tool.status])).toEqual([
      ['range-b', 'success'],
      ['range-a', 'error'],
    ]);
    expect(fake.listeners.size).toBe(0);
  });

  it('forwards server-created proposals only for the active request', async () => {
    const fake = makeBridge();
    window.choraleAI = fake.bridge;
    const proposal = {
      id: 'proposal-1',
      runId: 'request-1',
      documentId: 'document-1',
      sourceRevision: 2,
      state: 'proposed' as const,
      annotation: {
        id: 'annotation-1',
        kind: 'explanation' as const,
        span: { startMeasure: 1, endMeasure: 2 },
        label: 'Cadence',
        body: 'The phrase closes here.',
        source: 'assistant' as const,
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    };
    vi.mocked(fake.bridge.sendChat).mockImplementation(async () => {
      fake.emit({ type: 'proposal-created', requestId: 'request-1', proposal });
      fake.emit({ type: 'chat-done', requestId: 'request-1' });
      fake.emit({
        type: 'proposal-created',
        requestId: 'request-1',
        proposal: { ...proposal, id: 'late-proposal' },
      });
      return { requestId: 'request-1' };
    });
    const onProposalCreated = vi.fn();

    await new DesktopSheetAgent().send(
      request,
      { onDelta: vi.fn(), onStart: vi.fn(), onProposalCreated },
      new AbortController().signal,
    );

    expect(onProposalCreated).toHaveBeenCalledOnce();
    expect(onProposalCreated).toHaveBeenCalledWith(proposal);
  });

  it('reports desktop-required state without a preload bridge', async () => {
    await expect(new DesktopSheetAgent().send(
      request,
      { onDelta: vi.fn(), onStart: vi.fn() },
      new AbortController().signal,
    )).rejects.toThrow('desktop app');
  });

  it('forwards steerChat to the preload bridge', async () => {
    const fake = makeBridge();
    fake.bridge.steerChat = vi.fn(async () => ({ steered: true }));
    window.choraleAI = fake.bridge;

    const agent = new DesktopSheetAgent();
    const result = await agent.steer('req-123', {
      messageId: 'msg-steer',
      question: 'Focus on measure 3',
      context: request.context,
    });

    expect(fake.bridge.steerChat).toHaveBeenCalledWith('req-123', {
      messageId: 'msg-steer',
      question: 'Focus on measure 3',
      context: request.context,
    });
    expect(result).toEqual({ steered: true });
  });

  it('handles structured deltas, tool timing, steer acceptance, and round usage', async () => {
    const fake = makeBridge();
    window.choraleAI = fake.bridge;
    vi.mocked(fake.bridge.sendChat).mockImplementation(async () => {
      fake.emit({
        type: 'chat-start',
        requestId: 'request-1',
        connectionId: 'conn-1',
        modelId: 'm-1',
        providerKind: 'openai',
      });
      fake.emit({
        type: 'chat-delta',
        requestId: 'request-1',
        text: 'Thinking step',
        partType: 'reasoning',
        partId: 'part-0',
      });
      fake.emit({
        type: 'tool-start',
        requestId: 'request-1',
        toolCallId: 'tc-1',
        toolName: 'read_measure_range',
        summary: 'Reading mm. 1-2',
        startTime: '2026-09-02T12:00:00.000Z',
      });
      fake.emit({
        type: 'tool-done',
        requestId: 'request-1',
        toolCallId: 'tc-1',
        toolName: 'read_measure_range',
        status: 'success',
        summary: 'Read 2 measures',
        durationMs: 120,
        endTime: '2026-09-02T12:00:00.120Z',
      });
      fake.emit({
        type: 'steer-accepted',
        requestId: 'request-1',
        messageId: 'steer-1',
      });
      fake.emit({
        type: 'chat-done',
        requestId: 'request-1',
        usage: {
          input: 100,
          output: 50,
          cacheRead: 10,
          cacheWrite: 0,
          totalTokens: 160,
        },
      });
      return { requestId: 'request-1' };
    });

    const onDelta = vi.fn();
    const onToolStart = vi.fn();
    const onToolDone = vi.fn();
    const onSteerAccepted = vi.fn();
    const onDone = vi.fn();

    await new DesktopSheetAgent().send(
      request,
      {
        onDelta,
        onStart: vi.fn(),
        onToolStart,
        onToolDone,
        onSteerAccepted,
        onDone,
      },
      new AbortController().signal,
    );

    expect(onDelta).toHaveBeenCalledWith('Thinking step', 'reasoning', 'part-0');
    expect(onToolStart).toHaveBeenCalledWith({
      toolCallId: 'tc-1',
      toolName: 'read_measure_range',
      status: 'running',
      summary: 'Reading mm. 1-2',
      startTime: '2026-09-02T12:00:00.000Z',
    });
    expect(onToolDone).toHaveBeenCalledWith({
      toolCallId: 'tc-1',
      toolName: 'read_measure_range',
      status: 'success',
      summary: 'Read 2 measures',
      durationMs: 120,
      endTime: '2026-09-02T12:00:00.120Z',
    });
    expect(onSteerAccepted).toHaveBeenCalledWith('steer-1');
    expect(onDone).toHaveBeenCalledWith({
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 0,
      totalTokens: 160,
    });
  });
});
