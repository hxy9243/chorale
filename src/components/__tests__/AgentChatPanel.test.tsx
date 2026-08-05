import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChatPanel } from '../AgentChatPanel';
import { CONVERSATION_STORAGE_KEY } from '../../agent/conversationStore';
import type { AIProviderState } from '../../agent/useAIProviders';
import type { SheetAgentRequest } from '../../agent/aiTypes';
import type { Annotation } from '../../types/document';

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
    const annotations: Annotation[] = [{
      id: 'annotation-context',
      kind: 'explanation',
      span: { startMeasure: 1, endMeasure: 1 },
      label: 'Opening',
      body: 'Opening annotation.',
      source: 'user',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }];
    const { unmount } = render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-local-edit"
        abcCode={'X:1\nT:Edited in memory\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Local edit.abc"
        revision={12}
        annotations={annotations}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'What changed?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Grounded mock response');
    const request = agentSendMock.mock.calls[0][0] as SheetAgentRequest;
    expect(request.context).toMatchObject({
      documentId: 'doc-local-edit',
      revision: 12,
      annotations: [{ label: 'Opening', span: { startMeasure: 1, endMeasure: 1 } }],
    });
    expect(request.context.annotations).not.toBe(annotations);
    expect(request.context.annotations[0].span).not.toBe(annotations[0].span);
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
    fireEvent.click(screen.getByLabelText('Conversation history'));
    const options = within(screen.getByRole('listbox', { name: 'Conversation threads' }))
      .getAllByRole('option');
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

  it('uses a full header row and shows the selected measure inside the composer', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-layout"
        abcCode={'X:1\nT:Layout\nK:C\nCDEF|'}
        activeFileName="Layout.abc"
        revision={2}
        activeAnchor={{ startMeasure: 3, endMeasure: 3 }}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const threadSelect = screen.getByLabelText('Conversation history');
    const threadControl = threadSelect.closest('.agent-history-control');
    expect(threadControl?.parentElement?.className).toContain('agent-history-row');
    expect(threadControl?.parentElement?.parentElement?.className)
      .toContain('agent-panel-header');
    expect(threadControl?.querySelector('.agent-history-icon')).toBeNull();
    expect(threadControl?.querySelectorAll('.agent-history-chevron')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete current thread' })).toBeDefined();
    expect(screen.queryByText('Analysis')).toBeNull();
    expect(screen.queryByText(/Selection:/)).toBeNull();
    expect(screen.queryByText('Earlier in this score')).toBeNull();
    const selectionIndicator = screen.getByText('Selected m. 3');
    expect(selectionIndicator.closest('.agent-composer-anchor')).not.toBeNull();
    expect(selectionIndicator.closest('form')?.className).toContain('agent-composer');
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

    const threadSelect = screen.getByLabelText('Conversation history');
    expect(threadSelect.textContent).toContain('First thread');

    fireEvent.click(screen.getByRole('button', { name: 'Delete current thread' }));
    expect(threadSelect.textContent).toContain('Second thread');
    fireEvent.click(threadSelect);
    expect(screen.queryByRole('option', { name: 'First thread' })).toBeNull();
    fireEvent.click(threadSelect);

    fireEvent.click(screen.getByRole('button', { name: 'Delete current thread' }));
    fireEvent.click(threadSelect);
    const remainingOptions = within(screen.getByRole('listbox', { name: 'Conversation threads' }))
      .getAllByRole('option');
    expect(remainingOptions).toHaveLength(1);
    expect(remainingOptions[0].textContent).toBe('New thread');
    expect(threadSelect.textContent).not.toContain('Second thread');

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

  it('keeps the chat input height until content overflows, then grows within 35 percent of the panel', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-growing-input"
        abcCode={'X:1\nT:Growing input\nK:C\nCDEF|'}
        activeFileName="Growing input.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const panel = screen.getByLabelText('Current sheet assistant');
    const textarea = screen.getByLabelText('Ask about the current sheet') as HTMLTextAreaElement;
    const composer = textarea.closest('form') as HTMLFormElement;
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ height: 800 } as DOMRect);
    vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({ height: 160 } as DOMRect);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({ height: 80 } as DOMRect);
    Object.defineProperty(textarea, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 80 });

    fireEvent.change(textarea, { target: { value: 'A short question' } });

    expect(textarea.style.height).toBe('');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 320 });

    fireEvent.change(textarea, { target: { value: 'A long question '.repeat(40) } });

    expect(textarea.style.height).toBe('200px');
    expect(textarea.style.overflowY).toBe('auto');
    const resizeHandle = screen.getByRole('button', { name: 'Resize chat input' });
    expect(resizeHandle.getAttribute('aria-controls')).toBe('agent-question');
    expect(resizeHandle.querySelectorAll('.agent-composer-resize-icon path')).toHaveLength(3);
  });

  it('closes the model selection popup when focus moves outside it', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-model-picker"
        abcCode={'X:1\nT:Model picker\nK:C\nCDEF|'}
        activeFileName="Model picker.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const picker = screen.getByRole('button', { name: 'Choose AI provider and model' });
    fireEvent.click(picker);
    expect(picker.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'AI model selection' })).toBeDefined();

    fireEvent.focus(screen.getByLabelText('Ask about the current sheet'));

    expect(picker.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog', { name: 'AI model selection' })).toBeNull();
  });

  it('uses a rounded custom thread menu and selects a thread from one chevron trigger', () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 2,
      files: {
        'doc-thread-menu': {
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
        fileId="doc-thread-menu"
        abcCode={'X:1\nT:Threads\nK:C\nCDEF|'}
        activeFileName="Threads.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    const trigger = screen.getByLabelText('Conversation history');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.querySelectorAll('.agent-history-chevron')).toHaveLength(1);
    fireEvent.click(trigger);
    const secondThread = screen.getByRole('option', { name: 'Second thread' });
    fireEvent.click(secondThread);

    expect(trigger.textContent).toContain('Second thread');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
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
