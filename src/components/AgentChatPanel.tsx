import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Send, Square, Trash2, X } from 'lucide-react';
import { DesktopSheetAgent } from '../agent/DesktopSheetAgent';
import type { AIProviderState } from '../agent/useAIProviders';
import {
  loadConversation,
  makeEmptyConversation,
  saveConversation,
} from '../agent/conversationStore';
import type { ChatMessage, ChatThread, MusicContextSnapshot, PersistedFileConversation } from '../agent/types';
import type { ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  abcCode: string;
  activeFileName: string;
  revision: number;
  activeAnchor?: ScoreAnchor | null;
  ai: AIProviderState;
  onOpenSettings(): void;
}

const SUGGESTED_QUESTIONS = [
  'Explain the voice leading',
  'Find non-chord tones',
  'Suggest a simpler reharmonization',
] as const;

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

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  open,
  onClose,
  fileId = '',
  abcCode,
  activeFileName,
  revision,
  activeAnchor = null,
  ai,
  onOpenSettings,
}) => {
  const [conversation, setConversation] = useState<PersistedFileConversation>(() => (
    fileId ? loadConversation(fileId) : makeEmptyConversation()
  ));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const agentRef = useRef<DesktopSheetAgent | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const threadPickerRef = useRef<HTMLDivElement>(null);
  const threadTriggerRef = useRef<HTMLButtonElement>(null);
  const providerPickerRef = useRef<HTMLDivElement>(null);
  const providerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (abortControllerRef.current) {
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
  }, [fileId]);

  useEffect(() => {
    if (!fileId) return;
    saveConversation(fileId, conversation);
  }, [conversation, fileId]);

  const activeThread = useMemo(() => (
    conversation.threads.find((thread) => thread.id === conversation.activeThreadId) || conversation.threads[0]
  ), [conversation]);

  const messages = useMemo(() => activeThread?.messages || [], [activeThread]);
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

  const captureContext = (): MusicContextSnapshot => ({
    id: makeId(),
    revision,
    capturedAt: new Date().toISOString(),
    fileName: activeFileName || 'Untitled score',
    abc: abcCode,
    selection: activeAnchor
      ? {
          measureStart: activeAnchor.measure,
          measureEnd: activeAnchor.endMeasure || activeAnchor.measure,
          abcRange:
            activeAnchor.abcOffset !== undefined
              ? { start: activeAnchor.abcOffset, end: activeAnchor.abcOffset + 1 }
              : undefined,
        }
      : undefined,
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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const agent = getAgent();
      await agent.send({ history, question, context }, {
        onDelta: (delta) => updateMessages(threadId, (current) => current.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content + delta }
            : message
        ))),
        onStart: (provider) => updateMessages(threadId, (current) => current.map((message) => (
          message.id === assistantId ? { ...message, provider } : message
        ))),
      }, controller.signal);
      updateMessages(threadId, (current) => current.map((message) => (
        message.id === assistantId ? { ...message, status: 'complete' } : message
      )));
    } catch (caught) {
      const wasStopped = caught instanceof DOMException && caught.name === 'AbortError';
      updateMessages(threadId, (current) => current.map((message) => (
        message.id === assistantId
          ? {
              ...message,
              content: message.content || (wasStopped ? 'Response stopped.' : 'No response received.'),
              status: wasStopped ? 'stopped' : 'error',
            }
          : message
      )));
      if (!wasStopped) {
        setError(caught instanceof Error ? caught.message : 'The agent could not respond.');
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setIsStreaming(false);
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

  return (
    <aside className="agent-panel" aria-label="Current sheet assistant">
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
            <div className="agent-history-preview">
              <span>Earlier in this score</span>
              <strong>{activeThread?.title || 'Cadence analysis'}</strong>
              <small>{messages.length} messages · ABC revision {revision}</small>
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
                {formatAnchorLabel({
                  measure: message.context.selection.measureStart || 1,
                  endMeasure: message.context.selection.measureEnd,
                })}
              </div>
            )}
            <div className="agent-message-content">{message.content}</div>
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

      <form className="agent-composer" onSubmit={sendMessage}>
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
              aria-label="Choose AI provider and model"
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
            <div className="agent-provider-popover" id="agent-provider-popover" role="dialog" aria-label="AI model selection">
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
              <button type="button" onClick={() => {
                setProviderPickerOpen(false);
                onOpenSettings();
              }}>Manage providers</button>
            </div>
            )}
          </div>
        )}
        <label htmlFor="agent-question" className="sr-only">Ask about the current sheet</label>
        <textarea
          id="agent-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
