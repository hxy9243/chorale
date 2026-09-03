import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChatPanel } from '../AgentChatPanel';
import { CONVERSATION_STORAGE_KEY, DURABLE_CONVERSATION_MARKER_PREFIX } from '../../agent/conversationStore';
import { storageAdapter } from '../../utils/storageAdapter';
import type { AIProviderState } from '../../agent/useAIProviders';

const agentSendMock = vi.hoisted(() => vi.fn());
const agentSteerMock = vi.hoisted(() => vi.fn());

vi.mock('../../agent/DesktopSheetAgent', () => ({
  DesktopSheetAgent: class {
    send(...args: unknown[]) {
      return agentSendMock(...args);
    }
    steer(...args: unknown[]) {
      return agentSteerMock(...args);
    }
  },
}));

const ai: AIProviderState = {
  desktopAvailable: true,
  loading: false,
  connections: [{
    id: 'openai-test',
    name: 'OpenAI test',
    kind: 'openai',
    authType: 'api-key',
    persistence: 'encrypted',
    status: 'ready',
  }],
  selection: { connectionId: 'openai-test', modelId: 'gpt-test' },
  modelsByConnection: {
    'openai-test': [{
      id: 'gpt-test',
      name: 'GPT Test',
      source: 'live',
      reasoning: true,
      thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high'],
    }],
  },
  oauth: null,
  error: null,
  reload: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  refreshModels: vi.fn(),
  setSelection: vi.fn(),
  openTraceDirectory: vi.fn(async () => undefined),
  startCodexLogin: vi.fn(),
  cancelCodexLogin: vi.fn(),
};

describe('AgentChatPanel assistant-ui features', () => {
  beforeEach(() => {
    localStorage.clear();
    storageAdapter.clearMemoryStore();
    agentSendMock.mockReset();
    agentSteerMock.mockReset();
  });

  it('renders token usage footer with expandable breakdown on completed assistant message', () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 4,
      files: {
        'doc-tokens': {
          activeThreadId: 't-tokens',
          threads: [{
            id: 't-tokens',
            title: 'Token thread',
            updatedAt: '2026-09-02T12:00:00.000Z',
            messages: [{
              id: 'm-tokens',
              role: 'assistant',
              content: 'Cadence identified.',
              createdAt: '2026-09-02T12:00:00.000Z',
              status: 'complete',
              usage: {
                input: 120,
                output: 45,
                cacheRead: 15,
                cacheWrite: 0,
                reasoning: 10,
                totalTokens: 180,
              },
            }],
          }],
        },
      },
    }));

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-tokens"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const tokenButton = screen.getByRole('button', { name: /Round 180 tokens · Conversation 180 tokens/i });
    expect(tokenButton).toBeTruthy();

    fireEvent.click(tokenButton);
    expect(screen.getByText(/Prompt:/)).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText(/Completion:/)).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText(/Reasoning:/)).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('renders structured parts: reasoning, timed tools, and markdown text', () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 4,
      files: {
        'doc-parts': {
          activeThreadId: 't-parts',
          threads: [{
            id: 't-parts',
            title: 'Parts thread',
            updatedAt: '2026-09-02T12:00:00.000Z',
            messages: [{
              id: 'm-parts',
              role: 'assistant',
              content: 'The phrase is periodic.',
              createdAt: '2026-09-02T12:00:00.000Z',
              status: 'complete',
              parts: [
                { type: 'reasoning', text: 'Analyzing symmetry of mm. 1-8.', status: 'complete' },
                {
                  type: 'tool',
                  toolCallId: 'tc-1',
                  toolName: 'read_measure_range',
                  summary: 'Read 8 measures',
                  status: 'success',
                  durationMs: 42,
                },
                { type: 'text', text: 'The phrase is periodic.' },
              ],
            }],
          }],
        },
      },
    }));

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-parts"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    // Reasoning trace collapsed by default
    expect(screen.getByText('Thinking')).toBeTruthy();
    // Tool with duration
    expect(screen.getByText('Read 8 measures')).toBeTruthy();
    expect(screen.getByText('42ms')).toBeTruthy();
    // Main text
    expect(screen.getByText('The phrase is periodic.')).toBeTruthy();
  });

  it('enqueues follow-up when busy on Enter, and priority steers on Ctrl+Shift+Enter', async () => {
    let sendResolver: () => void = () => {};
    agentSendMock.mockImplementation((_req, callbacks, signal) => new Promise<void>((resolve, reject) => {
      callbacks.onRequestId?.('req-1');
      sendResolver = () => {
        callbacks.onDelta?.('First answer', 'text');
        callbacks.onDone?.({ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 });
        resolve();
      };
      signal.addEventListener('abort', () => reject(new DOMException('The response was stopped.', 'AbortError')));
    }));
    agentSteerMock.mockResolvedValue({ steered: true });

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-queue"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const textarea = screen.getByLabelText('Ask about the current sheet');

    // 1. Send first prompt
    fireEvent.change(textarea, { target: { value: 'First question' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(agentSendMock).toHaveBeenCalledOnce();
    });

    // 2. Type while streaming and press Enter -> should enqueue FIFO follow-up
    fireEvent.change(textarea, { target: { value: 'Follow-up question' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(screen.getByText('Follow-up question')).toBeTruthy();
    expect(screen.getByText(/Pending Messages/)).toBeTruthy();

    // 3. Ctrl+Enter is still a normal follow-up, not a priority steer
    fireEvent.change(textarea, { target: { value: 'Ctrl follow-up' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(screen.getByText('Ctrl follow-up')).toBeTruthy();
    expect(agentSteerMock).not.toHaveBeenCalled();

    // 4. Type while streaming and press Ctrl+Shift+Enter -> priority steer
    fireEvent.change(textarea, { target: { value: 'Steer priority' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(agentSteerMock).toHaveBeenCalled();
    });

    // 5. Complete the active run -> queue should be drained next in FIFO order
    sendResolver();
    await waitFor(() => {
      expect(agentSendMock).toHaveBeenCalledTimes(2);
    });

    const secondRequest = agentSendMock.mock.calls[1][0];
    expect(secondRequest.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'First question' }),
      expect.objectContaining({ role: 'assistant', content: 'First answer', status: 'complete' }),
    ]));
  });

  it('requeues a steer rejected at the end-of-run boundary and executes it exactly once', async () => {
    let resolveFirstSend: () => void = () => {};
    agentSendMock.mockImplementationOnce((_req, callbacks) => new Promise<void>((resolve) => {
      callbacks.onRequestId?.('req-ending');
      resolveFirstSend = () => {
        callbacks.onDone?.({ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 });
        resolve();
      };
    })).mockImplementation((_req, callbacks) => {
      callbacks.onDone?.({ input: 5, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 10 });
      return Promise.resolve();
    });
    agentSteerMock.mockResolvedValue({ steered: false });

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-steer-race"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const textarea = screen.getByLabelText('Ask about the current sheet');
    fireEvent.change(textarea, { target: { value: 'Initial question' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(agentSendMock).toHaveBeenCalledOnce());

    fireEvent.change(textarea, { target: { value: 'Elaborate on that' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(agentSteerMock).toHaveBeenCalledOnce();
      expect(screen.getByText('Elaborate on that')).toBeTruthy();
    });

    await act(async () => resolveFirstSend());
    await waitFor(() => expect(agentSendMock).toHaveBeenCalledTimes(2));
    expect(agentSendMock.mock.calls[1][0].question).toBe('Elaborate on that');
    await act(async () => Promise.resolve());
    expect(agentSendMock).toHaveBeenCalledTimes(2);
  });

  it('Escape cancels the running stream while preserving draft and pending queue', async () => {
    agentSendMock.mockImplementation((_req, _callbacks, signal) => new Promise<void>((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('The response was stopped.', 'AbortError')));
    }));

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-escape"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const textarea = screen.getByLabelText('Ask about the current sheet') as HTMLTextAreaElement;

    // Send first prompt
    fireEvent.change(textarea, { target: { value: 'Initial question' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(agentSendMock).toHaveBeenCalledOnce();
    });

    // Enqueue a follow up
    fireEvent.change(textarea, { target: { value: 'Queued item' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(screen.getByText('Queued item')).toBeTruthy();

    // Type a draft in the composer
    fireEvent.change(textarea, { target: { value: 'Unsent draft' } });

    // Press Escape
    fireEvent.keyDown(textarea, { key: 'Escape' });

    // Stream stops: indicator changes to stopped
    await waitFor(() => {
      expect(screen.getByText('Stopped')).toBeTruthy();
    });

    // Draft and queue are preserved!
    expect(textarea.value).toBe('Unsent draft');
    expect(screen.getByText('Queued item')).toBeTruthy();
  });

  it('renders streaming hints, combines consecutive thinking deltas into a single block, and renders tool visual blocks', async () => {
    let callbacksRef: any;
    agentSendMock.mockImplementation((_req, callbacks, _signal) => {
      callbacksRef = callbacks;
      return new Promise<void>(() => undefined);
    });

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-streaming-details"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const textarea = screen.getByLabelText('Ask about the current sheet');
    fireEvent.change(textarea, { target: { value: 'Analyze harmony' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(agentSendMock).toHaveBeenCalledOnce();
    });

    // 1. Verify streaming hint before the send/stop button
    expect(screen.getByText(/to queue/)).toBeTruthy();
    expect(screen.getByText(/to steer/)).toBeTruthy();

    // 2. Stream consecutive thinking deltas with returns
    act(() => {
      callbacksRef.onDelta('Let us inspect m. 1.\n', 'reasoning');
      callbacksRef.onDelta('The tonic chord is C major.\r\n', 'reasoning');
      callbacksRef.onDelta('Checking voice leading...', 'reasoning');
    });

    // Thinking block is rendered in a single active streaming trace
    const traces = document.querySelectorAll('.agent-thinking-trace');
    expect(traces).toHaveLength(1);
    expect(traces[0].classList.contains('is-streaming')).toBe(true);
    expect(traces[0].textContent).toContain('Let us inspect m. 1.');
    expect(traces[0].textContent).toContain('The tonic chord is C major.');
    expect(traces[0].textContent).toContain('Checking voice leading...');

    // 3. Tool execution in colored visual block
    act(() => {
      callbacksRef.onToolStart({
        toolCallId: 'tc-test-1',
        toolName: 'get_score_summary',
        summary: 'Reading score measures 1-4',
        status: 'running',
        startTime: '2026-09-02T12:00:00.000Z',
      });
    });

    const toolRow = document.querySelector('.agent-tool-row');
    expect(toolRow).not.toBeNull();
    expect(toolRow?.getAttribute('data-status')).toBe('running');
    expect(toolRow?.getAttribute('data-tool-name')).toBe('get_score_summary');
    expect(toolRow?.textContent).toContain('Reading score measures 1-4');

    // Tool done
    act(() => {
      callbacksRef.onToolDone({
        toolCallId: 'tc-test-1',
        toolName: 'get_score_summary',
        summary: 'Read score measures 1-4',
        status: 'success',
        durationMs: 45,
      });
    });

    expect(toolRow?.getAttribute('data-status')).toBe('success');
    expect(toolRow?.textContent).toContain('45ms');

    // 4. Stream consecutive text deltas -> should combine into single message block & paragraph
    act(() => {
      callbacksRef.onDelta('The phrase starts on the tonic. ', 'text');
      callbacksRef.onDelta('It continues with a dominant harmony in m. 2.', 'text');
    });

    const streamdownBlocks = document.querySelectorAll('.chorale-streamdown-message');
    expect(streamdownBlocks).toHaveLength(1);
    expect(streamdownBlocks[0].textContent).toContain('The phrase starts on the tonic. It continues with a dominant harmony in m. 2.');
    expect(streamdownBlocks[0].textContent).not.toContain('Let us inspect m. 1.');
    expect(streamdownBlocks[0].textContent).not.toContain('The tonic chord is C major.');
    expect(streamdownBlocks[0].textContent).not.toContain('Checking voice leading...');
  });

  it('Run next atomically dequeues selected item and does not re-execute it on completion', async () => {
    let sendCount = 0;
    const sendPrompts: string[] = [];
    let resolveFirstSend: () => void = () => {};

    agentSendMock.mockImplementation((req, callbacks) => {
      sendCount++;
      sendPrompts.push(req.question);
      if (sendCount === 1) {
        return new Promise<void>((resolve) => {
          resolveFirstSend = () => {
            callbacks.onDone?.({ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 });
            resolve();
          };
        });
      }
      callbacks.onDone?.({ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 });
      return Promise.resolve();
    });

    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 4,
      files: {
        'doc-run-next': {
          activeThreadId: 't-run-next',
          threads: [{
            id: 't-run-next',
            title: 'Run Next Thread',
            updatedAt: '2026-09-02T12:00:00.000Z',
            messages: [],
            pendingMessages: [
              {
                id: 'q-item-1',
                prompt: 'Analyze soprano line',
                lane: 'queue',
                createdAt: '2026-09-02T12:00:00.000Z',
                context: {
                  id: 'ctx-1',
                  documentId: 'doc-run-next',
                  revision: 1,
                  capturedAt: '2026-09-02T12:00:00.000Z',
                  fileName: 'score.abc',
                  abc: 'X:1\nK:C\nC4|',
                  annotations: [],
                },
              },
              {
                id: 'q-item-2',
                prompt: 'Analyze bass harmony',
                lane: 'queue',
                createdAt: '2026-09-02T12:01:00.000Z',
                context: {
                  id: 'ctx-2',
                  documentId: 'doc-run-next',
                  revision: 1,
                  capturedAt: '2026-09-02T12:01:00.000Z',
                  fileName: 'score.abc',
                  abc: 'X:1\nK:C\nC4|',
                  annotations: [],
                },
              },
            ],
          }],
        },
      },
    }));

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-run-next"
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    // Both items are in the queue initially
    expect(screen.getByText('Analyze soprano line')).toBeTruthy();
    expect(screen.getByText('Analyze bass harmony')).toBeTruthy();

    // Click "Run next" for the first item
    const runNextButtons = screen.getAllByRole('button', { name: 'Run next' });
    expect(runNextButtons).toHaveLength(2);
    fireEvent.click(runNextButtons[0]);

    // First prompt started
    expect(sendPrompts).toEqual(['Analyze soprano line']);

    // "Analyze soprano line" was dequeued immediately, only "Analyze bass harmony" remains in pending queue
    const queueList = document.querySelector('.agent-queue-list');
    expect(queueList?.textContent).not.toContain('Analyze soprano line');
    expect(queueList?.textContent).toContain('Analyze bass harmony');

    // Resolve the first prompt run
    await act(async () => {
      resolveFirstSend();
    });

    // The drain loop in finally should pick "Analyze bass harmony", NOT "Analyze soprano line" again
    await waitFor(() => {
      expect(sendPrompts).toEqual(['Analyze soprano line', 'Analyze bass harmony']);
    });
    expect(sendCount).toBe(2);
  });

  it('persists queued messages through durable storage pipeline across simulated page reload during active stream', async () => {
    const fileId = 'doc-durable-stream';
    const threadId = 't-durable-stream';

    // 1. Set up an initial conversation in durable storage (IndexedDB)
    const initialConversation = {
      activeThreadId: threadId,
      threads: [{
        id: threadId,
        title: 'Durable thread',
        updatedAt: '2026-09-02T12:00:00.000Z',
        messages: [{
          id: 'msg-prior',
          role: 'user',
          content: 'Initial question',
          createdAt: '2026-09-02T12:00:00.000Z',
          status: 'complete',
          parts: [{ type: 'text', text: 'Initial question' }],
        }],
        pendingMessages: [],
      }],
    };

    const initialStore = {
      version: 4,
      files: {
        [fileId]: initialConversation,
      },
    };

    // Populate IndexedDB and set durable hydration marker in localStorage
    await storageAdapter.setItem(CONVERSATION_STORAGE_KEY, initialStore);
    localStorage.setItem(`${DURABLE_CONVERSATION_MARKER_PREFIX}${fileId}`, '1');
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(initialStore));

    // 2. Mock streaming send that stays active
    agentSendMock.mockImplementation((_req, callbacks) => new Promise<void>(() => {
      callbacks.onRequestId?.('req-streaming');
      callbacks.onStart?.('openai');
      callbacks.onDelta?.('Thinking about harmony...', 'reasoning');
    }));

    // 3. Render AgentChatPanel
    const { unmount } = render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId={fileId}
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    // Wait for initial durable hydration to complete (aria-busy becomes false)
    const panel = screen.getByRole('complementary', { name: 'Current sheet assistant' });
    await waitFor(() => {
      expect(panel.getAttribute('aria-busy')).toBe('false');
    });

    const textarea = screen.getByLabelText('Ask about the current sheet');

    // Start a new streaming request
    fireEvent.change(textarea, { target: { value: 'Analyze harmony' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(agentSendMock).toHaveBeenCalledOnce();
    });

    // 4. While stream is running, enqueue a follow-up item
    fireEvent.change(textarea, { target: { value: 'Queued durable question' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // Item appears in queue UI
    expect(screen.getByText('Queued durable question')).toBeTruthy();

    // Wait for savePendingQueueAsync to finish saving to durable storage (IndexedDB)
    await waitFor(async () => {
      const stored = await storageAdapter.getItem<any>(CONVERSATION_STORAGE_KEY, null);
      const pendingInDurable = stored?.files?.[fileId]?.threads?.[0]?.pendingMessages;
      expect(pendingInDurable?.length).toBe(1);
      expect(pendingInDurable?.[0]?.prompt).toBe('Queued durable question');
    });

    // 5. Simulate page reload while stream was active: unmount and remount with durable hydration
    unmount();

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId={fileId}
        abcCode="X:1\nK:C\nC4|"
        activeFileName="score.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    // Verify that after durable hydration from IndexedDB, the queued item is restored
    await waitFor(() => {
      expect(screen.getByText('Queued durable question')).toBeTruthy();
    });
  });
});
