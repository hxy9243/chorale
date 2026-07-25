import React, { useEffect, useRef, useState } from 'react';
import { Bot, Eraser, Send, Square, X } from 'lucide-react';
import type { PiSheetAgent } from '../agent/PiSheetAgent';
import {
  clearConversation,
  loadConversation,
  saveConversation,
} from '../agent/conversationStore';
import type { ChatMessage, MusicContextSnapshot } from '../agent/types';

import type { ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
  abcCode: string;
  activeFileName: string;
  revision: number;
  activeAnchor?: ScoreAnchor | null;
}

const makeId = () => crypto.randomUUID();

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  open,
  onClose,
  abcCode,
  activeFileName,
  revision,
  activeAnchor = null,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation());
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const agentPromiseRef = useRef<Promise<PiSheetAgent> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const getAgent = () => {
    agentPromiseRef.current ??= import('../agent/PiSheetAgent')
      .then(({ PiSheetAgent: SheetAgent }) => new SheetAgent());
    return agentPromiseRef.current;
  };

  useEffect(() => {
    saveConversation(messages);
  }, [messages]);

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


  const stop = () => {
    abortControllerRef.current?.abort();
    void agentPromiseRef.current?.then((agent) => agent.abort());
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || !abcCode.trim() || isStreaming) return;

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
    const history = messages;

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft('');
    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const agent = await getAgent();
      await agent.send(history, question, context, {
        onDelta: (delta) => setMessages((current) => current.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content + delta }
            : message
        ))),
      }, controller.signal);
      setMessages((current) => current.map((message) => (
        message.id === assistantId ? { ...message, status: 'complete' } : message
      )));
    } catch (caught) {
      const wasStopped = caught instanceof DOMException && caught.name === 'AbortError';
      setMessages((current) => current.map((message) => (
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

  const handleClear = () => {
    if (isStreaming) stop();
    setMessages([]);
    clearConversation();
    setError(null);
  };

  if (!open) return null;

  return (
    <aside className="agent-panel glass-panel" aria-label="Current sheet assistant">
      <div className="agent-panel-header">
        <div>
          <div className="agent-title">
            <Bot aria-hidden="true" size={19} />
            <h2>Current Sheet</h2>
          </div>
          <p>Pi agent SDK · mock model</p>
        </div>
        <div className="agent-header-actions">
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            onClick={handleClear}
            title="Clear conversation"
            aria-label="Clear conversation"
            disabled={messages.length === 0}
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

      <div className="agent-context-banner">
        <span>{activeFileName || 'No score loaded'}</span>
        {activeAnchor ? (
          <span className="text-coral font-semibold">[{formatAnchorLabel(activeAnchor)}] &bull; r{revision}</span>
        ) : (
          <span>ABC rev {revision}</span>
        )}
      </div>


      <div className="agent-transcript" ref={transcriptRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <Bot aria-hidden="true" size={32} />
            <h3>Ask about this score</h3>
            <p>The current unsaved ABC notation is captured when you send.</p>
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
          <button type="button" className="btn btn-secondary agent-send" onClick={stop}>
            <Square size={15} />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary agent-send"
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
