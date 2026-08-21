import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Send, Square, Trash2, X } from 'lucide-react';
import { DesktopSheetAgent } from '../agent/DesktopSheetAgent';
import { createMusicContextSnapshot } from '../agent/musicContext';
import { prepareAbcForPlayback } from '../utils/abcAudio';
import type { AIProviderState } from '../agent/useAIProviders';
import {
  type AIThinkingLevel,
  isAIThinkingLevel,
} from '../agent/aiTypes';
import {
  loadConversation,
  makeEmptyConversation,
  saveConversation,
} from '../agent/conversationStore';
import type { ChatMessage, ChatThread, MusicContextSnapshot, PersistedFileConversation } from '../agent/types';
import type { Annotation, ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';
import { MarkdownMessage } from './MarkdownMessage';
import { AnnotationProposalCard } from './AnnotationProposalCard';
import { AnnotationEditor } from './AnnotationEditor';
import {
  editAnnotationProposal,
  markOutdatedProposals,
  prepareApplyAll,
  rejectAnnotationProposal,
} from '../agent/proposalActions';

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  abcCode: string;
  activeFileName: string;
  revision: number;
  annotations?: Annotation[];
  activeAnchor?: ScoreAnchor | null;
  totalMeasures?: number;
  scoreMeter?: string;
  ai: AIProviderState;
  onOpenSettings(): void;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  onApplyAnnotations?: (annotations: readonly Annotation[]) => void;
}

const SUGGESTED_QUESTIONS = [
  'Explain the voice leading',
  'Find non-chord tones',
  'Suggest a simpler reharmonization',
] as const;

const PROFILE_NAMES = {
  general: 'General analysis',
  harmony: 'Harmony analysis',
  'voice-leading': 'Voice-leading analysis',
  'form-phrase': 'Form and phrase analysis',
} as const;

const DEFAULT_TEXTAREA_HEIGHT = 80;
const COMPOSER_MAX_PANEL_RATIO = 0.35;
const KEYBOARD_RESIZE_STEP = 16;
const THINKING_LEVEL_STORAGE_KEY = 'chorale.agent.thinkingLevel';
const THINKING_LEVEL_LABELS: Record<AIThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Maximum',
};

const loadThinkingLevel = (): AIThinkingLevel => {
  try {
    const stored = window.localStorage.getItem(THINKING_LEVEL_STORAGE_KEY);
    return isAIThinkingLevel(stored) ? stored : 'off';
  } catch {
    return 'off';
  }
};

const makeId = () => crypto.randomUUID();

const makeThread = (title = 'New thread'): ChatThread => ({
  id: `thread-${makeId()}`,
  title,
  updatedAt: new Date().toISOString(),
  messages: [],
});

const deriveThreadTitle = (question: string) => {
  const cleaned = question.trim().replace(/\s+/g, ' ');
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}…` : cleaned;
};

const replaceActiveThread = (
  conversation: PersistedFileConversation,
  threadId: string,
  updater: (thread: ChatThread) => ChatThread,
): PersistedFileConversation => ({
  ...conversation,
  threads: conversation.threads.map((thread) => (
    thread.id === threadId ? updater(thread) : thread
  )),
});

const markProposalsUnavailable = (message: ChatMessage): ChatMessage => ({
  ...message,
  proposals: (message.proposals || []).map((proposal) => (
    proposal.state === 'proposed'
      ? { ...proposal, state: 'unavailable' as const }
      : proposal
  )),
});

const markRunUnavailable = (
  conversation: PersistedFileConversation,
  threadId: string,
  assistantId: string,
): PersistedFileConversation => replaceActiveThread(conversation, threadId, (thread) => ({
  ...thread,
  messages: thread.messages.map((message) => (
    message.id === assistantId
      ? {
          ...markProposalsUnavailable(message),
          content: message.content || 'Response stopped.',
          status: 'stopped',
        }
      : message
  )),
}));

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  open,
  onClose,
  fileId = '',
  abcCode,
  activeFileName,
  revision,
  annotations = [],
  activeAnchor = null,
  totalMeasures = 0,
  scoreMeter,
  ai,
  onOpenSettings,
  onNavigateMeasure = () => undefined,
  onApplyAnnotations,
}) => {
  const [conversation, setConversation] = useState<PersistedFileConversation>(() => (
    fileId ? loadConversation(fileId) : makeEmptyConversation()
  ));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<AIThinkingLevel>(loadThinkingLevel);
  const [editingProposal, setEditingProposal] = useState<{
    messageId: string;
    proposalId: string;
  } | null>(null);
  const [invalidProposalIds, setInvalidProposalIds] = useState<Record<string, string[]>>({});
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const agentRef = useRef<DesktopSheetAgent | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<{
    fileId: string;
    threadId: string;
    assistantId: string;
  } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeStartRef = useRef<{ pointerId: number; pointerY: number; height: number } | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const threadPickerRef = useRef<HTMLDivElement>(null);
  const threadTriggerRef = useRef<HTMLButtonElement>(null);
  const providerPickerRef = useRef<HTMLDivElement>(null);
  const providerTriggerRef = useRef<HTMLButtonElement>(null);

  const getTextareaBounds = useCallback(() => {
    const panel = panelRef.current;
    const composer = composerRef.current;
    const textarea = textareaRef.current;
    if (!panel || !composer || !textarea) {
      return { minHeight: DEFAULT_TEXTAREA_HEIGHT, maxHeight: DEFAULT_TEXTAREA_HEIGHT };
    }

    const renderedHeight = textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT;
    const minHeight = Number.parseFloat(getComputedStyle(textarea).minHeight) || DEFAULT_TEXTAREA_HEIGHT;
    const composerChrome = Math.max(0, composer.getBoundingClientRect().height - renderedHeight);
    const maxHeight = Math.max(
      minHeight,
      Math.floor(panel.getBoundingClientRect().height * COMPOSER_MAX_PANEL_RATIO - composerChrome),
    );
    return { minHeight, maxHeight };
  }, []);

  const setBoundedTextareaHeight = useCallback((requestedHeight: number) => {
    const { minHeight, maxHeight } = getTextareaBounds();
    setTextareaHeight(Math.min(maxHeight, Math.max(minHeight, requestedHeight)));
  }, [getTextareaBounds]);

  const growTextareaToContent = useCallback((textarea: HTMLTextAreaElement) => {
    const { minHeight, maxHeight } = getTextareaBounds();
    const currentHeight = textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT;
    const overflow = textarea.scrollHeight - textarea.clientHeight;
    if (overflow <= 1) {
      textarea.style.overflowY = 'hidden';
      return;
    }

    const nextHeight = Math.min(maxHeight, Math.max(minHeight, currentHeight + overflow));
    setTextareaHeight(nextHeight);
    textarea.style.overflowY = currentHeight + overflow > maxHeight ? 'auto' : 'hidden';
  }, [getTextareaBounds]);

  useEffect(() => {
    if (abortControllerRef.current) {
      const activeRun = activeRunRef.current;
      if (activeRun) {
        const unavailable = markRunUnavailable(
          conversationRef.current,
          activeRun.threadId,
          activeRun.assistantId,
        );
        conversationRef.current = unavailable;
        saveConversation(activeRun.fileId, unavailable);
      }
      stop();
      setIsStreaming(false);
    }
    if (!fileId) {
      setConversation(makeEmptyConversation());
      return;
    }
    setConversation(loadConversation(fileId));
    setDraft('');
    setError(null);
    setEditingProposal(null);
    setInvalidProposalIds({});
  }, [fileId]);

  useEffect(() => {
    if (!fileId) return;
    saveConversation(fileId, conversation);
  }, [conversation, fileId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THINKING_LEVEL_STORAGE_KEY, thinkingLevel);
    } catch {
      // Keep the session-level choice usable when browser storage is unavailable.
    }
  }, [thinkingLevel]);

  useEffect(() => {
    if (!fileId || revision <= 0) return;
    setConversation((current) => ({
      ...current,
      threads: current.threads.map((thread) => ({
        ...thread,
        messages: thread.messages.map((message) => (
          message.proposals?.length
            ? {
                ...message,
                proposals: markOutdatedProposals(message.proposals, fileId, revision),
              }
            : message
        )),
      })),
    }));
  }, [fileId, revision]);

  useEffect(() => {
    if (draft) return;
    setTextareaHeight(null);
    if (textareaRef.current) textareaRef.current.style.overflowY = 'hidden';
  }, [draft]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const { maxHeight } = getTextareaBounds();
      setTextareaHeight((current) => (current === null ? null : Math.min(current, maxHeight)));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [getTextareaBounds]);

  const activeThread = useMemo(() => (
    conversation.threads.find((thread) => thread.id === conversation.activeThreadId) || conversation.threads[0]
  ), [conversation]);

  const messages = useMemo(() => activeThread?.messages || [], [activeThread]);
  const anchorLabel = formatAnchorLabel(activeAnchor);
  const getAgent = () => {
    agentRef.current ??= new DesktopSheetAgent();
    return agentRef.current;
  };

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    if (typeof transcript.scrollTo === 'function') {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' });
    } else {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [messages]);

  useEffect(() => () => {
    const activeRun = activeRunRef.current;
    if (activeRun) {
      saveConversation(
        activeRun.fileId,
        markRunUnavailable(
          conversationRef.current,
          activeRun.threadId,
          activeRun.assistantId,
        ),
      );
    }
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) abortControllerRef.current?.abort();
  }, [open]);

  useEffect(() => {
    if (!threadMenuOpen && !providerPickerOpen) return;

    const handleOutsideInteraction = (event: PointerEvent | FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (threadMenuOpen && !threadPickerRef.current?.contains(target)) {
        setThreadMenuOpen(false);
      }
      if (providerPickerOpen && !providerPickerRef.current?.contains(target)) {
        setProviderPickerOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (providerPickerOpen) {
        setProviderPickerOpen(false);
        providerTriggerRef.current?.focus();
      } else if (threadMenuOpen) {
        setThreadMenuOpen(false);
        threadTriggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handleOutsideInteraction, true);
    document.addEventListener('focusin', handleOutsideInteraction, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction, true);
      document.removeEventListener('focusin', handleOutsideInteraction, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [providerPickerOpen, threadMenuOpen]);

  const captureContext = (): MusicContextSnapshot => createMusicContextSnapshot({
    id: makeId(),
    documentId: fileId,
    revision,
    capturedAt: new Date().toISOString(),
    fileName: activeFileName || 'Untitled score',
    abc: prepareAbcForPlayback(abcCode),
    selection: activeAnchor,
    annotations,
  });

  const updateMessages = (threadId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
    setConversation((current) => replaceActiveThread(current, threadId, (thread) => ({
      ...thread,
      updatedAt: new Date().toISOString(),
      messages: updater(thread.messages),
    })));
  };

  const stop = () => {
    abortControllerRef.current?.abort();
  };

  const handleNewThread = () => {
    if (!fileId || (activeThread && activeThread.messages.length === 0)) return;
    if (isStreaming) stop();
    const thread = makeThread();
    setConversation((current) => ({
      activeThreadId: thread.id,
      threads: [thread, ...current.threads],
    }));
    setDraft('');
    setError(null);
    setThreadMenuOpen(false);
  };

  const handleDeleteThread = () => {
    if (!fileId || !activeThread) return;
    if (isStreaming) stop();
    const threadId = activeThread.id;
    setConversation((current) => {
      const deletedIndex = current.threads.findIndex((thread) => thread.id === threadId);
      const remainingThreads = current.threads.filter((thread) => thread.id !== threadId);
      if (remainingThreads.length === 0) {
        const replacement = makeThread();
        return {
          activeThreadId: replacement.id,
          threads: [replacement],
        };
      }
      const nextActiveIndex = Math.min(
        Math.max(deletedIndex, 0),
        remainingThreads.length - 1,
      );
      return {
        activeThreadId: remainingThreads[nextActiveIndex].id,
        threads: remainingThreads,
      };
    });
    setDraft('');
    setError(null);
  };

  const returnToProposalEdit = (proposalId: string) => {
    setEditingProposal(null);
    queueMicrotask(() => {
      const editButtons = panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-proposal-edit]');
      Array.from(editButtons || [])
        .find((button) => button.dataset.proposalEdit === proposalId)
        ?.focus();
    });
  };

  const handleEditProposal = (
    messageId: string,
    proposalId: string,
    annotation: Annotation,
  ) => {
    const message = messages.find(({ id }) => id === messageId);
    if (!message?.proposals) return;
    const proposals = editAnnotationProposal(message.proposals, proposalId, annotation);
    updateMessages(activeThread.id, (current) => current.map((candidate) => (
      candidate.id === messageId ? { ...candidate, proposals } : candidate
    )));
    setInvalidProposalIds((current) => ({ ...current, [messageId]: [] }));
    returnToProposalEdit(proposalId);
  };

  const handleRejectProposal = (messageId: string, proposalId: string) => {
    updateMessages(activeThread.id, (current) => current.map((message) => (
      message.id === messageId && message.proposals
        ? {
            ...message,
            proposals: rejectAnnotationProposal(message.proposals, proposalId),
          }
        : message
    )));
  };

  const handleApplyAll = (message: ChatMessage) => {
    if (!message.proposals) return;
    const result = prepareApplyAll(
      message.proposals,
      fileId,
      revision,
      new Set(annotations.map(({ id }) => id)),
    );
    setInvalidProposalIds((current) => ({
      ...current,
      [message.id]: result.invalidProposalIds,
    }));
    if (result.status === 'outdated' || result.status === 'invalid') {
      updateMessages(activeThread.id, (current) => current.map((candidate) => (
        candidate.id === message.id ? { ...candidate, proposals: result.proposals } : candidate
      )));
      return;
    }
    if (result.status !== 'ready') return;

    try {
      if (!onApplyAnnotations) throw new Error('Annotation application is unavailable.');
      onApplyAnnotations(result.annotations);
      updateMessages(activeThread.id, (current) => current.map((candidate) => (
        candidate.id === message.id ? { ...candidate, proposals: result.proposals } : candidate
      )));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Annotations could not be applied.');
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || !abcCode.trim() || isStreaming || !activeThread || !providerReady) return;

    const context = captureContext();
    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
      context,
      status: 'complete',
    };
    const assistantId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
      profileRoutes: [],
      toolDisplays: [],
      proposals: [],
    };
    const history = activeThread.messages;
    const threadId = activeThread.id;

    setConversation((current) => replaceActiveThread(current, threadId, (thread) => ({
      ...thread,
      title: thread.messages.length === 0 ? deriveThreadTitle(question) || thread.title : thread.title,
      updatedAt: new Date().toISOString(),
      messages: [...thread.messages, userMessage, assistantMessage],
    })));
    setDraft('');
    setError(null);
    setIsStreaming(true);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeRunRef.current = { fileId, threadId, assistantId };
    const isCurrentRun = () => (
      abortControllerRef.current === controller && !controller.signal.aborted
    );

    try {
      const agent = getAgent();
      await agent.send({
        history,
        question,
        context,
        thinkingLevel: effectiveThinkingLevel,
      }, {
        onDelta: (delta) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: message.content + delta }
              : message
          )));
        },
        onStart: (provider) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => (
            message.id === assistantId ? { ...message, provider } : message
          )));
        },
        onProfileRoute: (profiles) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, profileRoutes: [...new Set(profiles)] }
              : message
          )));
        },
        onToolStart: (tool) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => (
            message.id === assistantId
              ? {
                  ...message,
                  toolDisplays: [
                    ...(message.toolDisplays || []).filter((item) => item.toolCallId !== tool.toolCallId),
                    tool,
                  ],
                }
              : message
          )));
        },
        onToolDone: (tool) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => {
          if (message.id !== assistantId) return message;
          const existing = message.toolDisplays || [];
          const found = existing.some((item) => item.toolCallId === tool.toolCallId);
          return {
            ...message,
            toolDisplays: found
              ? existing.map((item) => item.toolCallId === tool.toolCallId ? tool : item)
              : [...existing, tool],
          };
          }));
        },
        onProposalCreated: (proposal) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => (
            message.id === assistantId
              ? {
                  ...message,
                  proposals: [
                    ...(message.proposals || []).filter(({ id }) => id !== proposal.id),
                    proposal,
                  ],
                }
              : message
          )));
        },
      }, controller.signal);
      if (isCurrentRun()) {
        updateMessages(threadId, (current) => current.map((message) => (
          message.id === assistantId ? { ...message, status: 'complete' } : message
        )));
      }
    } catch (caught) {
      const wasStopped = caught instanceof DOMException && caught.name === 'AbortError';
      updateMessages(threadId, (current) => current.map((message) => (
        message.id === assistantId
          ? {
              ...markProposalsUnavailable(message),
              content: message.content || (wasStopped ? 'Response stopped.' : 'No response received.'),
              status: wasStopped ? 'stopped' : 'error',
            }
          : message
      )));
      if (!wasStopped) {
        const rawMessage = caught instanceof Error ? caught.message : 'The agent could not respond.';
        const formattedMessage = rawMessage.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
        setError(formattedMessage);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        activeRunRef.current = null;
        setIsStreaming(false);
      }
    }
  };

  if (!open) return null;

  const selectedConnection = ai.connections.find(
    (connection) => connection.id === ai.selection?.connectionId,
  );
  const selectedModels = selectedConnection
    ? (ai.modelsByConnection[selectedConnection.id] ?? [])
    : [];
  const selectedModel = selectedModels.find((model) => model.id === ai.selection?.modelId);
  const modelSupportsThinking = selectedModel?.reasoning === true;
  const supportedThinkingLevels: AIThinkingLevel[] = modelSupportsThinking
    ? (selectedModel.thinkingLevels ?? ['off', 'minimal', 'low', 'medium', 'high'])
    : ['off'];
  const effectiveThinkingLevel: AIThinkingLevel = supportedThinkingLevels.includes(thinkingLevel)
    ? thinkingLevel
    : supportedThinkingLevels.includes('medium')
      ? 'medium'
      : supportedThinkingLevels[0] ?? 'off';
  const providerReady = (
    ai.desktopAvailable &&
    selectedConnection?.status === 'ready' &&
    Boolean(selectedModel)
  );

  const chooseConnection = async (connectionId: string) => {
    if (!connectionId) {
      await ai.setSelection(null);
      return;
    }
    const models = ai.modelsByConnection[connectionId] ?? [];
    const firstModel = models[0] ?? (await ai.refreshModels(connectionId))[0];
    await ai.setSelection(firstModel ? { connectionId, modelId: firstModel.id } : null);
  };

  if (!open) return null;

  return (
    <aside className="agent-panel" aria-label="Current sheet assistant" ref={panelRef}>
      <div className="agent-panel-header">
        <div className="agent-title-row">
          <div>
            <h2>Chat with this score</h2>
            <p>Grounded in {activeFileName || 'the active score'}</p>
          </div>
          <div className="agent-header-actions">
          <button
            className="agent-icon-button"
            type="button"
            onClick={handleNewThread}
            title="Start new thread"
            aria-label="Start new thread"
            disabled={!fileId || (!!activeThread && activeThread.messages.length === 0)}
          >
            <Plus size={17} />
          </button>
          <button
            className="agent-icon-button"
            type="button"
            onClick={onClose}
            title="Close assistant"
            aria-label="Close assistant"
          >
            <X size={18} />
          </button>
          </div>
        </div>
        <div className="agent-history-row">
          <div className="agent-history-control" ref={threadPickerRef}>
            <button
              ref={threadTriggerRef}
              type="button"
              className="agent-history-trigger"
              aria-label="Conversation history"
              aria-haspopup="listbox"
              aria-expanded={threadMenuOpen}
              aria-controls="conversation-history-menu"
              onClick={() => {
                setThreadMenuOpen((current) => !current);
                setProviderPickerOpen(false);
              }}
            >
              <span>{activeThread?.title || 'New thread'}</span>
              <ChevronDown className="agent-history-chevron" size={16} aria-hidden="true" />
            </button>
            {threadMenuOpen && (
              <div
                className="agent-history-menu"
                id="conversation-history-menu"
                role="listbox"
                aria-label="Conversation threads"
              >
                {conversation.threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    role="option"
                    aria-selected={thread.id === activeThread?.id}
                    onClick={() => {
                      setConversation((current) => ({
                        ...current,
                        activeThreadId: thread.id,
                      }));
                      setThreadMenuOpen(false);
                      threadTriggerRef.current?.focus();
                    }}
                  >
                    <span>{thread.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="agent-icon-button agent-delete-thread-button"
            type="button"
            onClick={handleDeleteThread}
            title="Delete current thread"
            aria-label="Delete current thread"
            disabled={!fileId || !activeThread}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="agent-transcript" ref={transcriptRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <div className="agent-suggestions">
              <span>TRY ASKING</span>
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="agent-suggestion"
                  onClick={() => setDraft(question)}
                  disabled={!abcCode.trim()}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message) => (
          <article
            className={`agent-message ${message.role}`}
            key={message.id}
            data-status={message.status}
          >
            <div className="agent-message-label">
              {message.role === 'user' ? 'You' : 'Chorale'}
              {message.status === 'streaming' && <span>Thinking…</span>}
              {message.status === 'stopped' && <span>Stopped</span>}
            </div>
            {message.context?.selection && (
              <div className="agent-anchor-pill">
                {formatAnchorLabel(message.context.selection)}
              </div>
            )}
            <div className="agent-message-content">
              {message.role === 'assistant' ? (
                <MarkdownMessage
                  content={message.content}
                  totalMeasures={totalMeasures}
                  onNavigateMeasure={onNavigateMeasure}
                />
              ) : message.content}
            </div>
            {message.proposals && message.proposals.length > 0 && (
              <div className="annotation-proposal-list" aria-label="Annotation proposals">
                {message.proposals.map((proposal) => (
                  editingProposal?.messageId === message.id
                  && editingProposal.proposalId === proposal.id ? (
                    <AnnotationEditor
                      key={proposal.id}
                      mode="proposal"
                      initialAnnotation={proposal.annotation}
                      defaultSpan={proposal.annotation.span}
                      meter={scoreMeter}
                      onSave={(annotation) => handleEditProposal(message.id, proposal.id, annotation)}
                      onCancel={() => returnToProposalEdit(proposal.id)}
                    />
                  ) : (
                    <AnnotationProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      readOnly={message.status === 'streaming'}
                      invalid={invalidProposalIds[message.id]?.includes(proposal.id)}
                      onNavigateMeasure={onNavigateMeasure}
                      onEdit={() => {
                        setEditingProposal({ messageId: message.id, proposalId: proposal.id });
                      }}
                      onReject={() => handleRejectProposal(message.id, proposal.id)}
                    />
                  )
                ))}
                <button
                  type="button"
                  className="annotation-apply-all"
                  disabled={
                    message.status === 'streaming'
                    || !message.proposals.some(({ state }) => state === 'proposed')
                  }
                  onClick={() => handleApplyAll(message)}
                >
                  Apply All
                </button>
              </div>
            )}
            {message.profileRoutes && message.profileRoutes.length > 0 && (
              <div className="agent-profile-route" aria-label="Analysis profiles">
                {message.profileRoutes.map((profile) => (
                  <span key={profile}>{PROFILE_NAMES[profile]}</span>
                ))}
              </div>
            )}
            {message.toolDisplays && message.toolDisplays.length > 0 && (
              <div className="agent-tool-list" aria-label="Score tool activity">
                {message.toolDisplays.map((tool) => (
                  <div
                    className="agent-tool-row"
                    data-status={tool.status}
                    data-tool-call-id={tool.toolCallId}
                    key={tool.toolCallId}
                  >
                    {tool.summary}
                  </div>
                ))}
              </div>
            )}
            {message.provider && (
              <div className="agent-message-provider">
                {message.provider.providerKind} · {message.provider.modelId}
              </div>
            )}
            {message.context && (
              <div className="agent-message-context">
                {message.context.fileName} · ABC rev {message.context.revision}
              </div>
            )}
          </article>
        ))}
      </div>

      {error && <div className="agent-error" role="alert">{error}</div>}

      <form className="agent-composer" onSubmit={sendMessage} ref={composerRef}>
        {!ai.desktopAvailable && (
          <div className="agent-provider-required">
            <span>AI providers require the Chorale desktop app.</span>
          </div>
        )}
        {ai.desktopAvailable && (
          <div className="agent-provider-picker" ref={providerPickerRef}>
            <button
              ref={providerTriggerRef}
              type="button"
              className="agent-provider-trigger"
              aria-label="Choose AI provider, model, and thinking level"
              aria-haspopup="dialog"
              aria-expanded={providerPickerOpen}
              aria-controls="agent-provider-popover"
              onClick={() => {
                setProviderPickerOpen((current) => !current);
                setThreadMenuOpen(false);
              }}
            >
              <span>{selectedConnection?.name || 'Select provider'}</span>
              <strong>{selectedModel?.name || 'No model'}</strong>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {providerPickerOpen && (
            <div className="agent-provider-popover" id="agent-provider-popover" role="dialog" aria-label="AI chat configuration">
              <label>
                Provider
                <select
                  aria-label="AI provider"
                  value={selectedConnection?.id ?? ''}
                  onChange={(event) => void chooseConnection(event.target.value).catch((caught) => {
                    setError(caught instanceof Error ? caught.message : 'Could not select provider.');
                  })}
                >
                  <option value="">Select provider…</option>
                  {ai.connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name} ({connection.status})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model
                <select
                  aria-label="AI model"
                  value={selectedModel?.id ?? ''}
                  disabled={!selectedConnection}
                  onChange={(event) => {
                    if (selectedConnection) {
                      void ai.setSelection({
                        connectionId: selectedConnection.id,
                        modelId: event.target.value,
                      });
                      setProviderPickerOpen(false);
                    }
                  }}
                >
                  <option value="">Select model…</option>
                  {selectedModels.map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Thinking level
                <select
                  aria-label="Thinking level"
                  value={effectiveThinkingLevel}
                  disabled={!modelSupportsThinking}
                  onChange={(event) => {
                    if (isAIThinkingLevel(event.target.value)) {
                      setThinkingLevel(event.target.value);
                    }
                  }}
                >
                  {supportedThinkingLevels.map((level) => (
                    <option key={level} value={level}>{THINKING_LEVEL_LABELS[level]}</option>
                  ))}
                </select>
              </label>
              {!modelSupportsThinking && selectedModel && (
                <p className="agent-provider-note">This model does not advertise thinking support.</p>
              )}
              <button type="button" onClick={() => {
                setProviderPickerOpen(false);
                onOpenSettings();
              }}>Manage providers</button>
            </div>
            )}
          </div>
        )}
        {anchorLabel && (
          <div className="agent-composer-anchor">
            <span>Selected {anchorLabel}</span>
          </div>
        )}
        <label htmlFor="agent-question" className="sr-only">Ask about the current sheet</label>
        <div className="agent-composer-input">
          <textarea
            ref={textareaRef}
            id="agent-question"
            value={draft}
            style={textareaHeight === null ? undefined : { height: `${textareaHeight}px` }}
            onChange={(event) => {
              setDraft(event.target.value);
              if (event.target.value) growTextareaToContent(event.currentTarget);
            }}
            placeholder={!ai.desktopAvailable
              ? 'Open Chorale desktop to use AI'
              : !providerReady
                ? 'Select a provider and model'
                : abcCode.trim()
                  ? 'Ask about the current sheet…'
                  : 'Load a score to start chatting'}
            disabled={!abcCode.trim() || isStreaming || !providerReady}
            rows={3}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="agent-composer-resize-handle"
            type="button"
            aria-label="Resize chat input"
            aria-controls="agent-question"
            title="Drag vertically or use the arrow keys to resize"
            disabled={!abcCode.trim() || isStreaming || !providerReady}
            onPointerDown={(event) => {
              const textarea = textareaRef.current;
              if (!textarea) return;
              resizeStartRef.current = {
                pointerId: event.pointerId,
                pointerY: event.clientY,
                height: textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = resizeStartRef.current;
              if (!start || start.pointerId !== event.pointerId) return;
              setBoundedTextareaHeight(start.height + start.pointerY - event.clientY);
            }}
            onPointerUp={(event) => {
              if (resizeStartRef.current?.pointerId === event.pointerId) {
                resizeStartRef.current = null;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              resizeStartRef.current = null;
            }}
            onKeyDown={(event) => {
              const textarea = textareaRef.current;
              if (!textarea || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
              event.preventDefault();
              const currentHeight = textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT;
              setBoundedTextareaHeight(
                currentHeight + (event.key === 'ArrowUp' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP),
              );
            }}
          >
            <svg
              className="agent-composer-resize-icon"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M3 1 15 13" />
              <path d="M8 1 15 8" />
              <path d="M13 1 15 3" />
            </svg>
          </button>
        </div>
        {isStreaming ? (
          <button
            className="agent-send-button"
            type="button"
            onClick={stop}
            aria-label="Stop"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            className="agent-send-button"
            type="submit"
            disabled={!draft.trim() || !abcCode.trim() || !providerReady}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        )}
      </form>
    </aside>
  );
};
