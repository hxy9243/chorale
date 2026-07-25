import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Eraser, Plus, Send, Square, Wrench, X } from 'lucide-react';
import type { PiSheetAgent } from '../agent/PiSheetAgent';
import {
  clearConversation,
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
}

const AVAILABLE_TOOLS = [
  'score_info.read',
  'annotation.create',
  'abc.propose_edit',
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
}) => {
  const [conversation, setConversation] = useState<PersistedFileConversation>(() => (
    fileId ? loadConversation(fileId) : makeEmptyConversation()
  ));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const agentPromiseRef = useRef<Promise<PiSheetAgent> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

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
  const anchorLabel = formatAnchorLabel(activeAnchor);

  const getAgent = () => {
    agentPromiseRef.current ??= import('../agent/PiSheetAgent')
      .then(({ PiSheetAgent: SheetAgent }) => new SheetAgent());
    return agentPromiseRef.current;
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
    void agentPromiseRef.current?.then((agent) => agent.abort());
  }, []);

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
    void agentPromiseRef.current?.then((agent) => agent.abort());
  };

  const handleNewThread = () => {
    if (isStreaming) stop();
    const thread = makeThread();
    setConversation((current) => ({
      activeThreadId: thread.id,
      threads: [thread, ...current.threads],
    }));
    setDraft('');
    setError(null);
  };

  const handleClearThread = () => {
    if (!activeThread) return;
    if (isStreaming) stop();

    if (conversation.threads.length === 1) {
      clearConversation(fileId);
      const emptyConversation = makeEmptyConversation();
      setConversation(emptyConversation);
      saveConversation(fileId, emptyConversation);
      setError(null);
      return;
    }

    const nextThreads = conversation.threads.filter((thread) => thread.id !== activeThread.id);
    setConversation({
      activeThreadId: nextThreads[0].id,
      threads: nextThreads,
    });
    setError(null);
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || !abcCode.trim() || isStreaming || !activeThread) return;

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
      const agent = await getAgent();
      await agent.send(history, question, context, {
        onDelta: (delta) => updateMessages(threadId, (current) => current.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content + delta }
            : message
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

  return (
    <aside className="agent-panel glass-panel" aria-label="Current sheet assistant">
      <div className="agent-panel-header">
        <div>
          <div className="agent-title">
            <Bot aria-hidden="true" size={19} />
            <h2>Chat with score</h2>
          </div>
          <p>{activeFileName || 'No file selected'}</p>
        </div>
        <div className="agent-header-actions">
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            onClick={handleNewThread}
            title="Start new thread"
            aria-label="Start new thread"
            disabled={!fileId}
          >
            <Plus size={17} />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            onClick={handleClearThread}
            title="Clear current thread"
            aria-label="Clear current thread"
            disabled={!activeThread || messages.length === 0}
          >
            <Eraser size={17} />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            onClick={onClose}
            title="Close assistant"
            aria-label="Close assistant"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="agent-thread-bar">
        <label htmlFor="conversation-history" className="sr-only">Conversation history</label>
        <select
          id="conversation-history"
          className="agent-thread-select"
          value={activeThread?.id}
          onChange={(event) => setConversation((current) => ({
            ...current,
            activeThreadId: event.target.value,
          }))}
        >
          {conversation.threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
        <span className="agent-thread-meta">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="agent-context-banner">
        <span>{activeFileName || 'No score loaded'}</span>
        <span>{anchorLabel ? `${anchorLabel} · r${revision}` : `ABC rev ${revision}`}</span>
      </div>

      <div className="agent-tool-disclosure" aria-label="Available tools">
        <div className="agent-tool-heading">
          <Wrench size={14} />
          <span>Available tools</span>
        </div>
        <div className="agent-tool-list">
          {AVAILABLE_TOOLS.map((tool) => (
            <span key={tool} className="agent-tool-chip">{tool}</span>
          ))}
        </div>
      </div>

      <div className="agent-transcript" ref={transcriptRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <Bot aria-hidden="true" size={32} />
            <h3>Ask about this score</h3>
            <p>Messages stay scoped to the current file and capture the current revision when you send.</p>
            <button
              type="button"
              className="agent-suggestion"
              onClick={() => setDraft('What key and meter is this score in?')}
              disabled={!abcCode.trim()}
            >
              What key and meter is this score in?
            </button>
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
        {anchorLabel && (
          <div className="agent-composer-anchor">
            Attached anchor: <strong>{anchorLabel}</strong>
          </div>
        )}
        <label htmlFor="agent-question" className="sr-only">Ask about the current sheet</label>
        <textarea
          id="agent-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={abcCode.trim() ? 'Ask about the current sheet…' : 'Load a score to start chatting'}
          disabled={!abcCode.trim() || isStreaming}
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
            className="btn btn-secondary"
            type="button"
            onClick={stop}
          >
            <Square size={16} />
            Stop
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!draft.trim() || !abcCode.trim()}
          >
            <Send size={16} />
            Send
          </button>
        )}
      </form>
    </aside>
  );
};
