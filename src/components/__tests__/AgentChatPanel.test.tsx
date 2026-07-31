import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChatPanel } from '../AgentChatPanel';
import { CONVERSATION_STORAGE_KEY } from '../../agent/conversationStore';
import type { AIProviderState } from '../../agent/useAIProviders';

const agentSendMock = vi.hoisted(() => vi.fn());

vi.mock('../../agent/DesktopSheetAgent', () => ({
  DesktopSheetAgent: class {
    send(...args: unknown[]) {
      return agentSendMock(...args);
    }
  },
}));

const completeMockResponse = async (
  _request: unknown,
  callbacks: {
    onDelta: (delta: string) => void;
    onStart: (provider: { connectionId: string; providerKind: 'openai'; modelId: string }) => void;
  },
) => {
      callbacks.onStart({
        connectionId: 'openai-test',
        providerKind: 'openai',
        modelId: 'gpt-test',
      });
      callbacks.onDelta('Grounded mock response');
};

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
    'openai-test': [{ id: 'gpt-test', name: 'GPT Test', source: 'live' }],
  },
  oauth: null,
  error: null,
  reload: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  refreshModels: vi.fn(),
  setSelection: vi.fn(),
  startCodexLogin: vi.fn(),
  cancelCodexLogin: vi.fn(),
};

describe('AgentChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    agentSendMock.mockReset();
    agentSendMock.mockImplementation(completeMockResponse);
  });

  it('sends the current ABC revision and persists the conversation', async () => {
    const { unmount } = render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-local-edit"
        abcCode={'X:1\nT:Edited in memory\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Local edit.abc"
        revision={12}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'What changed?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Grounded mock response');
    expect(screen.getByText('Local edit.abc · ABC rev 12')).toBeDefined();

    await waitFor(() => {
      const saved = localStorage.getItem(CONVERSATION_STORAGE_KEY);
      expect(saved).toContain('Edited in memory');
      expect(saved).toContain('What changed?');
      expect(saved).toContain('doc-local-edit');
    });

    unmount();
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-local-edit"
        abcCode={'X:1\nT:Different state\nK:G\nGABc|'}
        activeFileName="Another score.abc"
        revision={13}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    expect(screen.getAllByText('What changed?').length).toBeGreaterThan(0);
    expect(screen.getByText('Grounded mock response')).toBeDefined();
    expect(screen.getByText('Local edit.abc · ABC rev 12')).toBeDefined();
  });

  it('disables start new thread button when conversation is empty and does not create empty threads', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-test"
        abcCode={'X:1\nT:Test\nK:C\nCDEF|'}
        activeFileName="Test.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const newThreadBtn = screen.getByTitle('Start new thread') as HTMLButtonElement;
    expect(newThreadBtn.disabled).toBe(true);

    fireEvent.click(newThreadBtn);
    const options = within(screen.getByLabelText('Conversation history')).getAllByRole('option');
    expect(options.length).toBe(1);
  });

  it('does not render analyze, edit, compose buttons or tools disclosure', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-test"
        abcCode={'X:1\nT:Test\nK:C\nCDEF|'}
        activeFileName="Test.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    expect(screen.queryByText('Analyze')).toBeNull();
    expect(screen.queryByText('Compose')).toBeNull();
    expect(screen.queryByText('Tools')).toBeNull();
  });

  it('uses a full header row for thread selection without redundant analysis or selection displays', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-layout"
        abcCode={'X:1\nT:Layout\nK:C\nCDEF|'}
        activeFileName="Layout.abc"
        revision={2}
        activeAnchor={{ measure: 3 }}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const threadSelect = screen.getByLabelText('Conversation history');
    const threadControl = threadSelect.closest('.agent-history-control');
    expect(threadControl?.parentElement?.className).toContain('agent-history-row');
    expect(threadControl?.parentElement?.parentElement?.className)
      .toContain('agent-panel-header');
    expect(threadControl?.querySelector('.agent-history-icon')).not.toBeNull();
    expect(threadControl?.querySelectorAll('.agent-history-chevron')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete current thread' })).toBeDefined();
    expect(screen.queryByText('Analysis')).toBeNull();
    expect(screen.queryByText(/Selection:/)).toBeNull();
    expect(screen.queryByText(/Attached anchor:/)).toBeNull();
  });

  it('deletes the active thread and keeps one fresh thread when history becomes empty', async () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 2,
      files: {
        'doc-history': {
          activeThreadId: 'thread-first',
          threads: [
            {
              id: 'thread-first',
              title: 'First thread',
              updatedAt: '2026-07-31T00:00:00.000Z',
              messages: [],
            },
            {
              id: 'thread-second',
              title: 'Second thread',
              updatedAt: '2026-07-31T00:01:00.000Z',
              messages: [],
            },
          ],
        },
      },
    }));

    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-history"
        abcCode={'X:1\nT:History\nK:C\nCDEF|'}
        activeFileName="History.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const threadSelect = screen.getByLabelText('Conversation history') as HTMLSelectElement;
    expect(threadSelect.value).toBe('thread-first');

    fireEvent.click(screen.getByRole('button', { name: 'Delete current thread' }));
    expect(threadSelect.value).toBe('thread-second');
    expect(within(threadSelect).queryByRole('option', { name: 'First thread' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete current thread' }));
    const remainingOptions = within(threadSelect).getAllByRole('option');
    expect(remainingOptions).toHaveLength(1);
    expect(remainingOptions[0].textContent).toBe('New thread');
    expect(threadSelect.value).not.toBe('thread-second');

    await waitFor(() => {
      const saved = localStorage.getItem(CONVERSATION_STORAGE_KEY) || '';
      expect(saved).not.toContain('thread-first');
      expect(saved).not.toContain('thread-second');
      expect(saved).toContain('New thread');
    });
  });

  it('shows desktop-required state and gates the composer without a preload bridge', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-browser"
        abcCode={'X:1\nT:Browser\nK:C\nCDEF|'}
        activeFileName="Browser.abc"
        revision={1}
        ai={{ ...ai, desktopAvailable: false, connections: [], selection: null }}
        onOpenSettings={() => undefined}
      />,
    );

    expect(screen.getByText('AI providers require the Chorale desktop app.')).toBeDefined();
    expect((screen.getByLabelText('Ask about the current sheet') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('aborts an in-flight request when the panel closes', async () => {
    agentSendMock.mockImplementation((
      _request: unknown,
      _callbacks: unknown,
      signal: AbortSignal,
    ) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Stopped', 'AbortError'));
      }, { once: true });
    }));
    const props = {
      onClose: () => undefined,
      fileId: 'doc-close',
      abcCode: 'X:1\nT:Close\nK:C\nCDEF|',
      activeFileName: 'Close.abc',
      revision: 1,
      ai,
      onOpenSettings: () => undefined,
    };
    const { rerender } = render(<AgentChatPanel {...props} open />);

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Keep streaming' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(agentSendMock).toHaveBeenCalledTimes(1));
    const signal = agentSendMock.mock.calls[0][2] as AbortSignal;

    await act(async () => {
      rerender(<AgentChatPanel {...props} open={false} />);
      await Promise.resolve();
    });

    expect(signal.aborted).toBe(true);
  });
});
