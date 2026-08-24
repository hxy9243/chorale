import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChatPanel } from '../AgentChatPanel';
import { CONVERSATION_STORAGE_KEY } from '../../agent/conversationStore';
import type { AIProviderState } from '../../agent/useAIProviders';
import type { SheetAgentRequest } from '../../agent/aiTypes';
import type { Annotation, AnnotationProposal, ScoreChangeProposal } from '../../types/document';

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

const proposal = {
  id: 'proposal-test',
  runId: 'request-test',
  documentId: 'doc-proposals',
  sourceRevision: 1,
  state: 'proposed' as const,
  annotation: {
    id: 'annotation-test',
    kind: 'explanation' as const,
    span: { startMeasure: 1, endMeasure: 1 },
    label: 'Opening',
    body: 'The opening establishes the idea.',
    source: 'assistant' as const,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
};

const seedProposalThread = (
  fileId: string,
  proposals: AnnotationProposal[],
  status: 'complete' | 'streaming' = 'complete',
) => {
  localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
    version: 3,
    files: {
      [fileId]: {
        activeThreadId: 'thread-review',
        threads: [{
          id: 'thread-review',
          title: 'Review proposals',
          updatedAt: '2026-08-05T00:00:00.000Z',
          messages: [{
            id: 'assistant-review',
            role: 'assistant',
            content: 'I found these annotations.',
            createdAt: '2026-08-05T00:00:00.000Z',
            status,
            proposals,
          }],
        }],
      },
    },
  }));
};

const seedScoreProposalThread = (fileId: string, scoreProposal: ScoreChangeProposal) => {
  localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
    version: 3,
    files: {
      [fileId]: {
        activeThreadId: 'thread-score-review',
        threads: [{
          id: 'thread-score-review',
          title: 'Review composition',
          updatedAt: '2026-08-05T00:00:00.000Z',
          messages: [{
            id: 'assistant-score-review',
            role: 'assistant',
            content: 'I composed a replacement.',
            createdAt: '2026-08-05T00:00:00.000Z',
            status: 'complete',
            scoreProposals: [scoreProposal],
          }],
        }],
      },
    },
  }));
};

describe('AgentChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    agentSendMock.mockReset();
    agentSendMock.mockImplementation(completeMockResponse);
  });

  it('previews, applies, and persists score proposal states', async () => {
    const scoreProposal: ScoreChangeProposal = {
      id: 'score-proposal-test',
      runId: 'run-score-test',
      documentId: 'doc-score-proposals',
      sourceRevision: 4,
      state: 'proposed',
      span: { startMeasure: 1, endMeasure: 2 },
      summary: 'A two-measure contrary-motion phrase.',
      replacementAbc: 'C E G c | c G E C |',
      validation: { status: 'valid', errors: [] },
    };
    seedScoreProposalThread('doc-score-proposals', scoreProposal);
    const onPreview = vi.fn(() => 'ready' as const);
    const onApply = vi.fn(() => 'accepted' as const);
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-score-proposals"
        abcCode={'X:1\nM:4/4\nL:1/4\nK:C\nZ | Z |]'}
        activeFileName="Draft"
        revision={4}
        ai={ai}
        onOpenSettings={() => undefined}
        onPreviewScoreProposal={onPreview}
        onApplyScoreProposal={onApply}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Preview/ }));
    expect(onPreview).toHaveBeenCalledWith(scoreProposal);
    fireEvent.click(screen.getByRole('button', { name: /Apply/ }));
    expect(onApply).toHaveBeenCalledWith(scoreProposal);
    expect(screen.getByText('Applied')).toBeDefined();
    await waitFor(() => expect(localStorage.getItem(CONVERSATION_STORAGE_KEY)).toContain('"state":"accepted"'));
  });

  it('marks a persisted score proposal outdated when the document revision changes', () => {
    seedScoreProposalThread('doc-score-outdated', {
      id: 'score-proposal-old', runId: 'run-old', documentId: 'doc-score-outdated', sourceRevision: 2,
      state: 'proposed', span: { startMeasure: 1, endMeasure: 1 }, summary: 'Old music',
      replacementAbc: 'C4 |', validation: { status: 'valid', errors: [] },
    });
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-score-outdated"
        abcCode={'X:1\nK:C\nC4 |]'}
        activeFileName="Draft"
        revision={3}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );
    expect(screen.getByText('Outdated')).toBeDefined();
    expect((screen.queryByRole('button', { name: /Preview/ }) as HTMLButtonElement | null)).toBeNull();
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

  it('configures and persists the selected thinking level for chat requests', async () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-thinking-level"
        abcCode={'X:1\nT:Thinking\nK:C\nCDEF|'}
        activeFileName="Thinking.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Choose AI provider, model, and thinking level',
    }));
    const thinkingLevel = screen.getByLabelText('Thinking level');
    expect([...thinkingLevel.querySelectorAll('option')].map(({ textContent }) => textContent)).toEqual([
      'Off',
      'Minimal',
      'Low',
      'Medium',
      'High',
    ]);
    fireEvent.change(thinkingLevel, { target: { value: 'medium' } });
    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Think through the cadence' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Grounded mock response');
    expect((agentSendMock.mock.calls[0][0] as SheetAgentRequest).thinkingLevel).toBe('medium');
    expect(localStorage.getItem('chorale.agent.thinkingLevel')).toBe('medium');
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

  it('edits and rejects staged proposals, then applies the remaining set atomically', async () => {
    const secondProposal: AnnotationProposal = {
      ...proposal,
      id: 'proposal-second',
      annotation: {
        ...proposal.annotation,
        id: 'annotation-second',
        label: 'Cadence',
        body: 'The phrase closes here.',
      },
    };
    seedProposalThread('doc-proposals', [proposal, secondProposal]);
    const onApplyAnnotations = vi.fn();
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-proposals"
        abcCode={'X:1\nT:Review\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Review.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
        onApplyAnnotations={onApplyAnnotations}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Apply All' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Apply$/ })).toBeNull();

    const openingCard = screen.getByLabelText('Opening annotation proposal');
    fireEvent.click(within(openingCard).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'Edited before acceptance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    await waitFor(() => expect(document.activeElement).toBe(
      within(screen.getByLabelText('Opening annotation proposal')).getByRole('button', { name: 'Edit' }),
    ));

    const cadenceCard = screen.getByLabelText('Cadence annotation proposal');
    fireEvent.click(within(cadenceCard).getByRole('button', { name: 'Reject' }));
    expect(within(cadenceCard).getByText('Rejected')).toBeDefined();
    expect(within(cadenceCard).queryByText('The phrase closes here.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apply All' }));
    expect(onApplyAnnotations).toHaveBeenCalledOnce();
    expect(onApplyAnnotations.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        id: 'annotation-test',
        body: 'Edited before acceptance.',
      }),
    ]);
    expect(within(screen.getByLabelText('Opening annotation proposal')).getByText('Accepted')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Apply All' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps live proposal cards read-only until their run completes', async () => {
    agentSendMock.mockImplementation((
      _request: unknown,
      callbacks: { onProposalCreated(value: AnnotationProposal): void },
    ) => new Promise<void>(() => {
      callbacks.onProposalCreated(proposal);
    }));
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-proposals"
        abcCode={'X:1\nT:Review\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Review.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
        onApplyAnnotations={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Suggest annotations' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const card = await screen.findByLabelText('Opening annotation proposal');
    expect((within(card).getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(card).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Apply All' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks revision-mismatched proposals outdated and blocks review actions', async () => {
    seedProposalThread('doc-proposals', [proposal]);
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-proposals"
        abcCode={'X:1\nT:Changed\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Changed.abc"
        revision={2}
        ai={ai}
        onOpenSettings={() => undefined}
        onApplyAnnotations={vi.fn()}
      />,
    );

    expect(await screen.findByText('Outdated')).toBeDefined();
    expect(screen.getByText(/Rerun analysis for the current score revision/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Apply All' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('waits for document hydration before evaluating proposal staleness', async () => {
    seedProposalThread('doc-proposals', [proposal]);
    const props = {
      open: true,
      onClose: () => undefined,
      fileId: 'doc-proposals',
      abcCode: 'X:1\nT:Hydrating\nM:4/4\nK:C\nCDEF|',
      activeFileName: 'Hydrating.abc',
      ai,
      onOpenSettings: () => undefined,
      onApplyAnnotations: vi.fn(),
    };
    const { rerender } = render(<AgentChatPanel {...props} revision={0} />);

    expect(screen.getByText('Proposed')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDefined();
    rerender(<AgentChatPanel {...props} revision={1} />);
    expect(screen.getByText('Proposed')).toBeDefined();
    expect(screen.queryByText('Outdated')).toBeNull();
  });

  it('applies none and identifies invalid cards when any proposed annotation collides', () => {
    const collidingAnnotation = proposal.annotation;
    seedProposalThread('doc-proposals', [proposal]);
    const onApplyAnnotations = vi.fn();
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-proposals"
        abcCode={'X:1\nT:Review\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Review.abc"
        revision={1}
        annotations={[collidingAnnotation]}
        ai={ai}
        onOpenSettings={() => undefined}
        onApplyAnnotations={onApplyAnnotations}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply All' }));
    expect(onApplyAnnotations).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Fix this proposal');
    expect(screen.getByText('Proposed')).toBeDefined();
  });

  it('shows the active range in the composer and captured user context', async () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-layout"
        abcCode={'X:1\nT:Layout\nK:C\nCDEF|'}
        activeFileName="Layout.abc"
        revision={2}
        activeAnchor={{ startMeasure: 3, endMeasure: 5 }}
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
    const selectionIndicator = screen.getByText('Selected mm. 3–5');
    expect(selectionIndicator.closest('.agent-composer-anchor')).not.toBeNull();
    expect(selectionIndicator.closest('form')?.className).toContain('agent-composer');

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Explain this passage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Grounded mock response');

    const request = agentSendMock.mock.calls[0][0] as SheetAgentRequest;
    expect(request.context.selection).toEqual({ startMeasure: 3, endMeasure: 5 });
    expect(screen.getByText('mm. 3–5').closest('.agent-anchor-pill')).not.toBeNull();
  });

  it('deselects the measure context when the composer clear button is clicked', () => {
    const onClearAnchor = vi.fn();
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-clear"
        abcCode={'X:1\nT:Clear\nK:C\nCDEF|'}
        activeFileName="Clear.abc"
        revision={2}
        activeAnchor={{ startMeasure: 3, endMeasure: 5 }}
        onClearAnchor={onClearAnchor}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deselect mm. 3–5 from chat context' }));
    expect(onClearAnchor).toHaveBeenCalledTimes(1);
  });

  it('renders assistant Markdown measure links through the score navigation callback', async () => {
    const onNavigateMeasure = vi.fn();
    agentSendMock.mockImplementation(async (_request, callbacks) => {
      callbacks.onStart({
        connectionId: 'openai-test',
        providerKind: 'openai',
        modelId: 'gpt-test',
      });
      callbacks.onDelta('Compare **both phrases** in [mm. 2–1](#measure-2-1).');
    });
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-markdown"
        abcCode={'X:1\nT:Links\nK:C\nCDEF|GABc|'}
        activeFileName="Links.abc"
        revision={1}
        totalMeasures={2}
        ai={ai}
        onOpenSettings={() => undefined}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Compare the phrases' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('both phrases')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'mm. 2–1' }));
    expect(onNavigateMeasure).toHaveBeenCalledWith({ startMeasure: 1, endMeasure: 2 });
  });

  it('navigates to score measures when clicking measure links inside proposal cards', async () => {
    const onNavigateMeasure = vi.fn();
    seedProposalThread('doc-proposals', [proposal]);
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-proposals"
        abcCode={'X:1\nT:Score\nK:C\nCDEF|GABc|'}
        activeFileName="Score.abc"
        revision={1}
        totalMeasures={2}
        ai={ai}
        onOpenSettings={() => undefined}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    const proposalMeasureLink = screen.getByRole('button', { name: 'Select m. 1' });
    fireEvent.click(proposalMeasureLink);
    expect(onNavigateMeasure).toHaveBeenCalledWith({ startMeasure: 1, endMeasure: 1 });
  });

  it('persists server-created proposals on the assistant turn and marks them unavailable on failure', async () => {
    agentSendMock.mockImplementation(async (_request, callbacks) => {
      callbacks.onStart({
        connectionId: 'openai-test',
        providerKind: 'openai',
        modelId: 'gpt-test',
      });
      callbacks.onProposalCreated(proposal);
      throw new Error('Provider failed after proposing');
    });
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-proposals"
        abcCode={'X:1\nT:Proposals\nK:C\nCDEF|'}
        activeFileName="Proposals.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Suggest an annotation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('alert');

    await waitFor(() => {
      const store = JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}');
      const messages = store.files['doc-proposals'].threads[0].messages;
      const assistant = messages.find((message: { role: string }) => message.role === 'assistant');
      expect(assistant.proposals).toEqual([{ ...proposal, state: 'unavailable' }]);
      expect(assistant.profileRoutes).toEqual([]);
      expect(assistant.toolDisplays).toEqual([]);
    });
  });

  it('keeps concurrent same-name score tools as separately correlated rows', async () => {
    agentSendMock.mockImplementation(async (_request, callbacks) => {
      callbacks.onStart({
        connectionId: 'openai-test',
        providerKind: 'openai',
        modelId: 'gpt-test',
      });
      callbacks.onProfileRoute(['harmony', 'voice-leading']);
      callbacks.onToolStart({
        toolCallId: 'range-a',
        toolName: 'read_measure_range',
        status: 'running',
        summary: 'Reading mm. 1–2',
      });
      callbacks.onToolStart({
        toolCallId: 'range-b',
        toolName: 'read_measure_range',
        status: 'running',
        summary: 'Reading mm. 3–4',
      });
      callbacks.onToolDone({
        toolCallId: 'range-b',
        toolName: 'read_measure_range',
        status: 'success',
        summary: 'Read 2 measures',
      });
      callbacks.onToolDone({
        toolCallId: 'range-a',
        toolName: 'read_measure_range',
        status: 'error',
        summary: 'Tool could not complete',
      });
      callbacks.onDelta('Answer');
    });
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-tools"
        abcCode={'X:1\nT:Tools\nK:C\nCDEF|'}
        activeFileName="Tools.abc"
        revision={1}
        ai={ai}
        onOpenSettings={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Analyze the passage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Answer');

    expect(screen.getByText('Harmony analysis')).toBeDefined();
    expect(screen.getByText('Voice-leading analysis')).toBeDefined();
    const first = document.querySelector<HTMLElement>('[data-tool-call-id="range-a"]')!;
    const second = document.querySelector<HTMLElement>('[data-tool-call-id="range-b"]')!;
    expect(first.dataset.status).toBe('error');
    expect(first.textContent).toBe('Tool could not complete');
    expect(second.dataset.status).toBe('success');
    expect(second.textContent).toBe('Read 2 measures');
  });

  it('deletes chat history without touching accepted document annotations', async () => {
    const acceptedAnnotation: Annotation = {
      ...proposal.annotation,
      id: 'accepted-document-annotation',
      source: 'assistant',
    };
    const onApplyAnnotations = vi.fn();
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 3,
      files: {
        'doc-history': {
          activeThreadId: 'thread-first',
          threads: [
            {
              id: 'thread-first',
              title: 'First thread',
              updatedAt: '2026-07-31T00:00:00.000Z',
              messages: [{
                id: 'assistant-with-proposal',
                role: 'assistant',
                content: 'A pending proposal.',
                createdAt: '2026-07-31T00:00:00.000Z',
                status: 'complete',
                proposals: [{ ...proposal, documentId: 'doc-history' }],
              }],
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
        annotations={[acceptedAnnotation]}
        ai={ai}
        onOpenSettings={() => undefined}
        onApplyAnnotations={onApplyAnnotations}
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
      expect(saved).not.toContain('proposal-test');
      expect(saved).toContain('New thread');
    });
    expect(onApplyAnnotations).not.toHaveBeenCalled();
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

    const picker = screen.getByRole('button', {
      name: 'Choose AI provider, model, and thinking level',
    });
    fireEvent.click(picker);
    expect(picker.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'AI chat configuration' })).toBeDefined();

    fireEvent.focus(screen.getByLabelText('Ask about the current sheet'));

    expect(picker.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog', { name: 'AI chat configuration' })).toBeNull();
  });

  it('uses a rounded custom thread menu and selects a thread from one chevron trigger', () => {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 3,
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

  it('aborts on file switch and ignores callbacks delivered after cancellation', async () => {
    agentSendMock.mockImplementation((
      _request: unknown,
      callbacks: any,
      signal: AbortSignal,
    ) => new Promise<void>((_resolve, reject) => {
      callbacks.onProposalCreated({
        ...proposal,
        documentId: 'doc-before',
      });
      signal.addEventListener('abort', () => {
        callbacks.onProfileRoute(['harmony']);
        callbacks.onToolStart({
          toolCallId: 'late-tool',
          toolName: 'read_measure_range',
          status: 'running',
          summary: 'Late tool',
        });
        callbacks.onDelta('Late answer');
        reject(new DOMException('Stopped', 'AbortError'));
      }, { once: true });
    }));
    const props = {
      open: true,
      onClose: () => undefined,
      abcCode: 'X:1\nT:Switch\nK:C\nCDEF|',
      activeFileName: 'Switch.abc',
      revision: 1,
      ai,
      onOpenSettings: () => undefined,
    };
    const { rerender } = render(<AgentChatPanel {...props} fileId="doc-before" />);
    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'Keep streaming' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(agentSendMock).toHaveBeenCalledOnce());
    const signal = agentSendMock.mock.calls[0][2] as AbortSignal;

    await act(async () => {
      rerender(<AgentChatPanel {...props} fileId="doc-after" />);
      await Promise.resolve();
    });

    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('Late answer')).toBeNull();
    expect(screen.queryByText('Late tool')).toBeNull();
    expect(screen.queryByText('Harmony analysis')).toBeNull();
    const previousStore = JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '{}');
    const previousMessages = previousStore.files['doc-before'].threads[0].messages;
    const previousAssistant = previousMessages.find((message: { role: string }) => (
      message.role === 'assistant'
    ));
    expect(previousAssistant.proposals).toEqual([
      expect.objectContaining({ id: 'proposal-test', state: 'unavailable' }),
    ]);
  });
});
