import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import { DesktopSheetAgent } from '../agent/DesktopSheetAgent';
import { createMusicContextSnapshot } from '../agent/musicContext';
import { prepareAbcForPlayback } from '../utils/abcAudio';
import type { AIProviderState } from '../agent/useAIProviders';
import {
  type AIThinkingLevel,
  isAIThinkingLevel,
} from '../agent/aiTypes';
import {
  conversationNeedsDurableHydration,
  getConversationTotalTokens,
  loadConversation,
  loadConversationAsync,
  makeEmptyConversation,
  saveConversation,
  saveConversationAsync,
  savePendingQueue,
} from '../agent/conversationStore';
import type {
  ChatMessage,
  ChatMessagePart,
  ChatThread,
  MusicContextSnapshot,
  PersistedFileConversation,
  QueuedChatMessage,
} from '../agent/types';
import type { Annotation, ScoreAnchor, ScoreChangeProposal } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';
import { AnnotationProposalCard } from './AnnotationProposalCard';
import { AnnotationEditor } from './AnnotationEditor';
import { ScoreChangeProposalCard } from './ScoreChangeProposalCard';
import {
  editAnnotationProposal,
  markOutdatedProposals,
  prepareApplyAll,
  rejectAnnotationProposal,
} from '../agent/proposalActions';
import { ChoraleStreamdownMessage } from './chat/ChoraleStreamdownMessage';
import { ChoraleReasoningView } from './chat/ChoraleReasoningView';
import { ChoraleToolDisplay } from './chat/ChoraleToolDisplay';
import { ChoraleTokenUsage } from './chat/ChoraleTokenUsage';
import { ChoraleQueueList } from './chat/ChoraleQueueList';
import { createChoraleQueueAdapter } from './chat/ChoraleQueueAdapter';
import { createChoraleExternalStoreAdapter } from './chat/ChoraleExternalStoreAdapter';
import { ChoraleComposer, type ChoraleComposerRef } from './chat/ChoraleComposer';

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  abcCode: string;
  activeFileName: string;
  revision: number;
  annotations?: Annotation[];
  activeAnchor?: ScoreAnchor | null;
  onClearAnchor?: () => void;
  totalMeasures?: number;
  scoreMeter?: string;
  ai: AIProviderState;
  onOpenSettings(): void;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  onApplyAnnotations?: (annotations: readonly Annotation[]) => void;
  onPreviewScoreProposal?: (proposal: ScoreChangeProposal) => 'ready' | 'outdated' | 'invalid';
  onApplyScoreProposal?: (proposal: ScoreChangeProposal) => 'accepted' | 'outdated' | 'invalid';
  onDiscardScoreProposal?: (proposal: ScoreChangeProposal) => void;
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

const THINKING_LEVEL_STORAGE_KEY = 'chorale.agent.thinkingLevel';

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
  pendingMessages: [],
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
  scoreProposals: (message.scoreProposals || []).map((proposal) => (
    proposal.state === 'proposed'
      ? { ...proposal, state: 'unavailable' as const }
      : proposal
  )),
});

const markOutdatedScoreProposals = (
  proposals: readonly ScoreChangeProposal[],
  fileId: string,
  revision: number,
) => proposals.map((proposal) => (
  proposal.state === 'proposed'
  && (proposal.documentId !== fileId || proposal.sourceRevision !== revision)
    ? { ...proposal, state: 'outdated' as const }
    : proposal
));

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
          status: 'stopped' as const,
        }
      : message
  )),
}));

interface ChatMessageItemProps {
  message: ChatMessage;
  scoreMeter?: string;
  totalMeasures: number;
  invalidProposalIds: Record<string, string[]>;
  editingProposal: { messageId: string; proposalId: string } | null;
  conversationTotalTokens?: number;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  onEditProposal: (messageId: string, proposalId: string, annotation: Annotation) => void;
  onRejectProposal: (messageId: string, proposalId: string) => void;
  onApplyAll: (message: ChatMessage) => void;
  onPreviewScoreProposal: (messageId: string, proposal: ScoreChangeProposal) => void;
  onApplyScoreProposal: (messageId: string, proposal: ScoreChangeProposal) => void;
  onDiscardScoreProposal: (messageId: string, proposal: ScoreChangeProposal) => void;
  onStartEditProposal: (messageId: string, proposalId: string) => void;
  onReturnToProposalEdit: (proposalId: string) => void;
}

const ChatMessageItem = React.memo(function ChatMessageItem({
  message,
  scoreMeter,
  totalMeasures,
  invalidProposalIds,
  editingProposal,
  conversationTotalTokens,
  onNavigateMeasure,
  onEditProposal,
  onRejectProposal,
  onApplyAll,
  onPreviewScoreProposal,
  onApplyScoreProposal,
  onDiscardScoreProposal,
  onStartEditProposal,
  onReturnToProposalEdit,
}: ChatMessageItemProps) {
  const renderedParts = useMemo(() => {
    if (!message.parts || message.parts.length === 0) return null;
    const merged: ChatMessagePart[] = [];
    for (const part of message.parts) {
      const last = merged[merged.length - 1];
      if (last && last.type === 'reasoning' && part.type === 'reasoning') {
        last.text += part.text;
        if (part.status === 'streaming') last.status = 'streaming';
      } else if (last && last.type === 'text' && part.type === 'text') {
        last.text += part.text;
      } else {
        merged.push({ ...part });
      }
    }
    return merged;
  }, [message.parts]);

  if (message.role === 'user') {
    return (
      <article
        className="agent-message user"
        key={message.id}
        data-status={message.status}
      >
        <div className="agent-message-label">
          You
        </div>
        {message.context?.selection && (
          <div className="agent-anchor-pill">
            {formatAnchorLabel(message.context.selection)}
          </div>
        )}
        <div className="agent-message-content">
          {message.content}
        </div>
        {message.context && (
          <div className="agent-message-context">
            {message.context.fileName} · ABC rev {message.context.revision}
          </div>
        )}
      </article>
    );
  }

  const hasParts = Array.isArray(renderedParts) && renderedParts.length > 0;

  return (
    <article
      className="agent-message assistant"
      key={message.id}
      data-status={message.status}
    >
      <div className="agent-message-label">
        Chorale
        {message.status === 'streaming' && <span>Thinking…</span>}
        {message.status === 'stopped' && <span>Stopped</span>}
      </div>

      <div className="agent-message-content">
        {hasParts ? (
          renderedParts!.map((part, index) => {
            if (part.type === 'reasoning') {
              return (
                <ChoraleReasoningView
                  key={`reasoning-${index}`}
                  reasoning={part.text}
                  status={part.status}
                />
              );
            }
            if (part.type === 'tool') {
              return (
                <ChoraleToolDisplay
                  key={part.toolCallId || `tool-${index}`}
                  tool={part}
                />
              );
            }
            if (part.type === 'text') {
              return (
                <ChoraleStreamdownMessage
                  key={`text-${index}`}
                  content={part.text}
                  isStreaming={message.status === 'streaming'}
                  totalMeasures={totalMeasures}
                  onNavigateMeasure={onNavigateMeasure || (() => undefined)}
                />
              );
            }
            return null;
          })
        ) : (
          <ChoraleStreamdownMessage
            content={message.content}
            isStreaming={message.status === 'streaming'}
            totalMeasures={totalMeasures}
            onNavigateMeasure={onNavigateMeasure || (() => undefined)}
          />
        )}
      </div>

      {message.toolDisplays && message.toolDisplays.length > 0 && !message.parts?.some((p) => p.type === 'tool') && (
        <div className="agent-tool-list" aria-label="Score tool activity">
          {message.toolDisplays.map((tool) => (
            <ChoraleToolDisplay
              key={tool.toolCallId}
              tool={tool}
            />
          ))}
        </div>
      )}

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
                onSave={(annotation) => onEditProposal(message.id, proposal.id, annotation)}
                onCancel={() => onReturnToProposalEdit(proposal.id)}
              />
            ) : (
              <AnnotationProposalCard
                key={proposal.id}
                proposal={proposal}
                readOnly={message.status === 'streaming'}
                invalid={invalidProposalIds[message.id]?.includes(proposal.id)}
                onNavigateMeasure={onNavigateMeasure}
                onEdit={() => onStartEditProposal(message.id, proposal.id)}
                onReject={() => onRejectProposal(message.id, proposal.id)}
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
            onClick={() => onApplyAll(message)}
          >
            Apply All
          </button>
        </div>
      )}

      {message.scoreProposals && message.scoreProposals.length > 0 && (
        <div className="score-change-proposal-list" aria-label="Score change proposals">
          {message.scoreProposals.map((proposal) => (
            <ScoreChangeProposalCard
              key={proposal.id}
              proposal={proposal}
              readOnly={message.status === 'streaming'}
              onPreview={() => onPreviewScoreProposal(message.id, proposal)}
              onApply={() => onApplyScoreProposal(message.id, proposal)}
              onDiscard={() => onDiscardScoreProposal(message.id, proposal)}
            />
          ))}
        </div>
      )}

      {message.profileRoutes && message.profileRoutes.length > 0 && (
        <div className="agent-profile-route" aria-label="Analysis profiles">
          {message.profileRoutes.map((profile) => (
            <span key={profile}>{PROFILE_NAMES[profile]}</span>
          ))}
        </div>
      )}

      {!hasParts && message.toolDisplays && message.toolDisplays.length > 0 && (
        <div className="agent-tool-list" aria-label="Score tool activity">
          {message.toolDisplays.map((tool) => (
            <ChoraleToolDisplay key={tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}

      {message.status !== 'streaming' && (
        <ChoraleTokenUsage
          usage={message.usage}
          conversationTotalTokens={conversationTotalTokens}
        />
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
  );
}, (prev, next) => {
  if (prev.message !== next.message) return false;
  if (prev.totalMeasures !== next.totalMeasures) return false;
  if (prev.scoreMeter !== next.scoreMeter) return false;
  if (prev.conversationTotalTokens !== next.conversationTotalTokens) return false;
  if (prev.onNavigateMeasure !== next.onNavigateMeasure) return false;
  const prevEditing = prev.editingProposal?.messageId === prev.message.id ? prev.editingProposal.proposalId : null;
  const nextEditing = next.editingProposal?.messageId === next.message.id ? next.editingProposal.proposalId : null;
  if (prevEditing !== nextEditing) return false;
  const prevInvalids = prev.invalidProposalIds[prev.message.id];
  const nextInvalids = next.invalidProposalIds[next.message.id];
  if (prevInvalids !== nextInvalids) return false;
  return true;
});

interface MessageListProps {
  messages: ChatMessage[];
  scoreMeter?: string;
  totalMeasures: number;
  invalidProposalIds: Record<string, string[]>;
  editingProposal: { messageId: string; proposalId: string } | null;
  conversationTotalTokens?: number;
  abcCode: string;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  onEditProposal: (messageId: string, proposalId: string, annotation: Annotation) => void;
  onRejectProposal: (messageId: string, proposalId: string) => void;
  onApplyAll: (message: ChatMessage) => void;
  onPreviewScoreProposal: (messageId: string, proposal: ScoreChangeProposal) => void;
  onApplyScoreProposal: (messageId: string, proposal: ScoreChangeProposal) => void;
  onDiscardScoreProposal: (messageId: string, proposal: ScoreChangeProposal) => void;
  onStartEditProposal: (messageId: string, proposalId: string) => void;
  onReturnToProposalEdit: (proposalId: string) => void;
  onSetDraft: (draft: string) => void;
}

const MemoizedMessageList = React.memo(function MemoizedMessageList({
  messages,
  scoreMeter,
  totalMeasures,
  invalidProposalIds,
  editingProposal,
  conversationTotalTokens,
  abcCode,
  onNavigateMeasure,
  onEditProposal,
  onRejectProposal,
  onApplyAll,
  onPreviewScoreProposal,
  onApplyScoreProposal,
  onDiscardScoreProposal,
  onStartEditProposal,
  onReturnToProposalEdit,
  onSetDraft,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="agent-empty-state">
        <div className="agent-suggestions">
          <span>TRY ASKING</span>
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              className="agent-suggestion"
              onClick={() => onSetDraft(question)}
              disabled={!abcCode.trim()}
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {messages.map((message) => (
        <ChatMessageItem
          key={message.id}
          message={message}
          scoreMeter={scoreMeter}
          totalMeasures={totalMeasures}
          invalidProposalIds={invalidProposalIds}
          editingProposal={editingProposal}
          conversationTotalTokens={conversationTotalTokens}
          onNavigateMeasure={onNavigateMeasure}
          onEditProposal={onEditProposal}
          onRejectProposal={onRejectProposal}
          onApplyAll={onApplyAll}
          onPreviewScoreProposal={onPreviewScoreProposal}
          onApplyScoreProposal={onApplyScoreProposal}
          onDiscardScoreProposal={onDiscardScoreProposal}
          onStartEditProposal={onStartEditProposal}
          onReturnToProposalEdit={onReturnToProposalEdit}
        />
      ))}
    </>
  );
});

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  open,
  onClose,
  fileId,
  abcCode,
  activeFileName,
  revision,
  annotations = [],
  activeAnchor,
  onClearAnchor,
  totalMeasures = 0,
  scoreMeter,
  ai,
  onOpenSettings,
  onNavigateMeasure,
  onApplyAnnotations,
  onPreviewScoreProposal,
  onApplyScoreProposal,
  onDiscardScoreProposal,
}) => {
  const [conversation, setConversation] = useState<PersistedFileConversation>(makeEmptyConversation);
  const [conversationFileId, setConversationFileId] = useState<string>('');
  const [durableHydrationPending, setDurableHydrationPending] = useState(false);
  const [durableHydrationFailed, setDurableHydrationFailed] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<{
    messageId: string;
    proposalId: string;
  } | null>(null);
  const [invalidProposalIds, setInvalidProposalIds] = useState<Record<string, string[]>>({});
  const [thinkingLevel, setThinkingLevel] = useState<AIThinkingLevel>(loadThinkingLevel);

  const panelRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<ChoraleComposerRef | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const threadPickerRef = useRef<HTMLDivElement | null>(null);
  const threadTriggerRef = useRef<HTMLButtonElement | null>(null);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<{ fileId: string; threadId: string; assistantId: string } | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const agentRef = useRef<DesktopSheetAgent | null>(null);
  const documentRevisionRef = useRef({ fileId, revision });
  documentRevisionRef.current = { fileId, revision };

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

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
        void saveConversationAsync(activeRun.fileId, unavailable);
      }
      stop();
      setIsStreaming(false);
    }
    if (!fileId) {
      setConversation(makeEmptyConversation());
      setConversationFileId('');
      setDurableHydrationPending(false);
      setDurableHydrationFailed(false);
      return;
    }
    setConversation(loadConversation(fileId));
    setConversationFileId(fileId);
    let cancelled = false;
    const needsDurableHydration = conversationNeedsDurableHydration(fileId);
    setDurableHydrationPending(needsDurableHydration);
    setDurableHydrationFailed(false);
    if (needsDurableHydration) {
      void loadConversationAsync(fileId).then((loaded) => {
        if (!cancelled) {
          setConversation(loaded);
          setDurableHydrationFailed(false);
        }
      }).catch(() => {
        if (!cancelled) {
          setDurableHydrationFailed(true);
          setError('Saved score proposals could not be restored. Reload to retry without overwriting them.');
        }
      }).finally(() => {
        if (!cancelled) setDurableHydrationPending(false);
      });
    }
    composerRef.current?.setDraft('');
    setError(null);
    setEditingProposal(null);
    setInvalidProposalIds({});
    return () => {
      cancelled = true;
    };
  }, [fileId, stop]);

  useEffect(() => {
    if (
      !fileId
      || conversationFileId !== fileId
      || isStreaming
      || durableHydrationPending
      || durableHydrationFailed
    ) return;
    saveConversation(fileId, conversation);
    void saveConversationAsync(fileId, conversation);
  }, [
    conversation,
    conversationFileId,
    durableHydrationFailed,
    durableHydrationPending,
    fileId,
    isStreaming,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THINKING_LEVEL_STORAGE_KEY, thinkingLevel);
    } catch {
      // Keep the choice usable when browser storage is unavailable.
    }
  }, [thinkingLevel]);

  useEffect(() => {
    if (!fileId || revision <= 0) return;
    setConversation((current) => ({
      ...current,
      threads: current.threads.map((thread) => ({
        ...thread,
        messages: thread.messages.map((message) => (
          message.proposals?.length || message.scoreProposals?.length
            ? {
                ...message,
                proposals: markOutdatedProposals(message.proposals || [], fileId, revision),
                scoreProposals: markOutdatedScoreProposals(message.scoreProposals || [], fileId, revision),
              }
            : message
        )),
      })),
    }));
  }, [fileId, revision]);

  const activeThread = useMemo(() => (
    conversation.threads.find((thread) => thread.id === conversation.activeThreadId) || conversation.threads[0]
  ), [conversation]);

  const messages = useMemo(() => activeThread?.messages || [], [activeThread]);
  const pendingMessages = useMemo(() => activeThread?.pendingMessages || [], [activeThread]);
  const pendingMessagesRef = useRef(pendingMessages);
  pendingMessagesRef.current = pendingMessages;
  const anchorLabel = formatAnchorLabel(activeAnchor);

  const getAgent = useCallback(() => {
    agentRef.current ??= new DesktopSheetAgent();
    return agentRef.current;
  }, []);

  useEffect(() => () => {
    const activeRun = activeRunRef.current;
    if (activeRun) {
      const unavailable = markRunUnavailable(
        conversationRef.current,
        activeRun.threadId,
        activeRun.assistantId,
      );
      saveConversation(activeRun.fileId, unavailable);
      void saveConversationAsync(activeRun.fileId, unavailable);
    }
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) abortControllerRef.current?.abort();
  }, [open]);

  useEffect(() => {
    if (!threadMenuOpen) return;
    const handleOutsideInteraction = (event: Event) => {
      const target = event.target as Node | null;
      if (threadMenuOpen && !threadPickerRef.current?.contains(target)) {
        setThreadMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (threadMenuOpen) {
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
  }, [threadMenuOpen]);

  const captureContext = useCallback((): MusicContextSnapshot => createMusicContextSnapshot({
    id: makeId(),
    documentId: fileId || '',
    revision,
    capturedAt: new Date().toISOString(),
    fileName: activeFileName || 'Untitled score',
    abc: prepareAbcForPlayback(abcCode),
    selection: activeAnchor,
    annotations,
  }), [abcCode, activeAnchor, activeFileName, annotations, fileId, revision]);

  const updateMessages = useCallback((threadId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
    setConversation((current) => replaceActiveThread(current, threadId, (thread) => ({
      ...thread,
      updatedAt: new Date().toISOString(),
      messages: updater(thread.messages),
    })));
  }, []);

  const updatePendingQueue = useCallback((threadId: string, nextQueue: QueuedChatMessage[]) => {
    setConversation((current) => replaceActiveThread(current, threadId, (thread) => ({
      ...thread,
      pendingMessages: nextQueue,
    })));
  }, []);

  const handleNewThread = () => {
    if (!fileId || (activeThread && activeThread.messages.length === 0)) return;
    if (isStreaming) stop();
    const thread = makeThread();
    setConversation((current) => ({
      activeThreadId: thread.id,
      threads: [thread, ...current.threads],
    }));
    composerRef.current?.setDraft('');
    setError(null);
    setThreadMenuOpen(false);
  };

  const handleDeleteThread = () => {
    if (!fileId || !activeThread) return;
    if (isStreaming) stop();
    setConversation((current) => {
      const remainingThreads = current.threads.filter((candidate) => candidate.id !== activeThread.id);
      if (remainingThreads.length === 0) {
        const fresh = makeThread();
        return {
          activeThreadId: fresh.id,
          threads: [fresh],
        };
      }
      const activeIndex = current.threads.findIndex((candidate) => candidate.id === activeThread.id);
      const nextActiveIndex = Math.max(0, activeIndex - 1);
      return {
        activeThreadId: remainingThreads[nextActiveIndex].id,
        threads: remainingThreads,
      };
    });
    composerRef.current?.setDraft('');
    setError(null);
  };

  const returnToProposalEdit = useCallback((proposalId: string) => {
    setEditingProposal(null);
    queueMicrotask(() => {
      const editButtons = panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-proposal-edit]');
      Array.from(editButtons || [])
        .find((button) => button.dataset.proposalEdit === proposalId)
        ?.focus();
    });
  }, []);

  const handleStartEditProposal = useCallback((messageId: string, proposalId: string) => {
    setEditingProposal({ messageId, proposalId });
  }, []);

  const handleEditProposal = useCallback((
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
  }, [activeThread.id, messages, returnToProposalEdit, updateMessages]);

  const handleRejectProposal = useCallback((messageId: string, proposalId: string) => {
    updateMessages(activeThread.id, (current) => current.map((message) => (
      message.id === messageId && message.proposals
        ? {
            ...message,
            proposals: rejectAnnotationProposal(message.proposals, proposalId),
          }
        : message
    )));
  }, [activeThread.id, updateMessages]);

  const handleApplyAll = useCallback((message: ChatMessage) => {
    if (!message.proposals) return;
    const result = prepareApplyAll(
      message.proposals,
      fileId || '',
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
  }, [activeThread.id, annotations, fileId, onApplyAnnotations, revision, updateMessages]);

  const updateScoreProposalState = useCallback((
    messageId: string,
    proposalId: string,
    state: ScoreChangeProposal['state'],
  ) => updateMessages(activeThread.id, (current) => current.map((message) => (
    message.id === messageId
      ? {
          ...message,
          scoreProposals: (message.scoreProposals || []).map((proposal) => (
            proposal.id === proposalId ? { ...proposal, state } : proposal
          )),
        }
      : message
  ))), [activeThread.id, updateMessages]);

  const handlePreviewScoreProposal = useCallback((messageId: string, proposal: ScoreChangeProposal) => {
    const result = onPreviewScoreProposal?.(proposal) || 'invalid';
    if (result === 'outdated') updateScoreProposalState(messageId, proposal.id, 'outdated');
    if (result === 'invalid') setError('This score proposal can no longer be previewed safely.');
  }, [onPreviewScoreProposal, updateScoreProposalState]);

  const handleApplyScoreProposal = useCallback((messageId: string, proposal: ScoreChangeProposal) => {
    const result = onApplyScoreProposal?.(proposal) || 'invalid';
    if (result === 'accepted') updateScoreProposalState(messageId, proposal.id, 'accepted');
    if (result === 'outdated') updateScoreProposalState(messageId, proposal.id, 'outdated');
    if (result === 'invalid') setError('This score proposal could not be applied safely.');
  }, [onApplyScoreProposal, updateScoreProposalState]);

  const handleDiscardScoreProposal = useCallback((messageId: string, proposal: ScoreChangeProposal) => {
    onDiscardScoreProposal?.(proposal);
    updateScoreProposalState(messageId, proposal.id, 'rejected');
  }, [onDiscardScoreProposal, updateScoreProposalState]);

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
    const models = await ai.refreshModels(connectionId);
    const firstModel = models[0];
    await ai.setSelection(firstModel ? { connectionId, modelId: firstModel.id } : null);
  };

  const queueAdapter = useMemo(() => createChoraleQueueAdapter({
    fileId: fileId || '',
    threadId: activeThread?.id || '',
    pendingMessages,
    onQueueChange: (nextQueue) => {
      if (activeThread?.id) {
        updatePendingQueue(activeThread.id, nextQueue);
      }
    },
    getMusicContext: captureContext,
  }), [fileId, activeThread?.id, pendingMessages, captureContext, updatePendingQueue]);

  const executePrompt = useCallback(async (
    question: string,
    customContext?: MusicContextSnapshot,
  ) => {
    if (
      !question || !abcCode.trim() || isStreaming || durableHydrationPending
      || !activeThread || !providerReady
    ) return;

    const context = customContext || captureContext();
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
      parts: [],
      profileRoutes: [],
      toolDisplays: [],
      proposals: [],
      scoreProposals: [],
    };
    const history = activeThread.messages;
    const threadId = activeThread.id;

    setConversation((current) => replaceActiveThread(current, threadId, (thread) => ({
      ...thread,
      title: thread.messages.length === 0 ? deriveThreadTitle(question) || thread.title : thread.title,
      updatedAt: new Date().toISOString(),
      messages: [...thread.messages, userMessage, assistantMessage],
    })));
    composerRef.current?.setDraft('');
    setError(null);
    setIsStreaming(true);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeRunRef.current = { fileId: fileId || '', threadId, assistantId };
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
        onRequestId: (reqId) => {
          activeRequestIdRef.current = reqId;
        },
        onDelta: (delta, partType) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => {
            if (message.id !== assistantId) return message;
            const nextContent = message.content + delta;
            const parts = message.parts ? [...message.parts] : [];
            const targetType = partType ?? 'text';

            const lastPart = parts[parts.length - 1];
            if (lastPart && lastPart.type === targetType) {
              parts[parts.length - 1] = {
                ...lastPart,
                text: lastPart.text + delta,
                ...(targetType === 'reasoning' ? { status: 'streaming' as const } : {}),
              };
            } else {
              if (targetType === 'reasoning') {
                parts.push({ type: 'reasoning', text: delta, status: 'streaming' });
              } else {
                parts.push({ type: 'text', text: delta });
              }
            }
            return { ...message, content: nextContent, parts };
          }));
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
          updateMessages(threadId, (current) => current.map((message) => {
            if (message.id !== assistantId) return message;
            const toolDisplays = [
              ...(message.toolDisplays || []).filter((item) => item.toolCallId !== tool.toolCallId),
              tool,
            ];
            const parts = (message.parts || []).map((p) => (
              p.type === 'reasoning' && p.status === 'streaming' ? { ...p, status: 'complete' as const } : p
            ));
            parts.push({
              type: 'tool',
              toolCallId: tool.toolCallId,
              toolName: tool.toolName,
              summary: tool.summary,
              status: 'running',
              startTime: tool.startTime,
            });
            return { ...message, toolDisplays, parts };
          }));
        },
        onToolDone: (tool) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => {
            if (message.id !== assistantId) return message;
            const toolDisplays = (message.toolDisplays || []).map((item) => (
              item.toolCallId === tool.toolCallId ? tool : item
            ));
            const parts = (message.parts || []).map((p) => (
              p.type === 'tool' && p.toolCallId === tool.toolCallId
                ? {
                    ...p,
                    status: tool.status,
                    summary: tool.summary,
                    durationMs: tool.durationMs,
                    endTime: tool.endTime,
                  }
                : p
            ));
            return { ...message, toolDisplays, parts };
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
        onScoreProposalCreated: (proposal) => {
          if (!isCurrentRun()) return;
          const currentDocument = documentRevisionRef.current;
          const currentProposal = (
            proposal.documentId === currentDocument.fileId
            && proposal.sourceRevision === currentDocument.revision
          ) ? proposal : { ...proposal, state: 'outdated' as const };
          updateMessages(threadId, (current) => current.map((message) => (
            message.id === assistantId
              ? {
                  ...message,
                  scoreProposals: [
                    ...(message.scoreProposals || []).filter(({ id }) => id !== proposal.id),
                    currentProposal,
                  ],
                }
              : message
          )));
        },
        onSteerAccepted: (messageId) => {
          if (!isCurrentRun()) return;
          queueAdapter.remove(messageId);
        },
        onDone: (usage) => {
          if (!isCurrentRun()) return;
          updateMessages(threadId, (current) => current.map((message) => {
            if (message.id !== assistantId) return message;
            const parts = (message.parts || []).map((p) => (
              p.type === 'reasoning' && p.status === 'streaming' ? { ...p, status: 'complete' as const } : p
            ));
            return {
              ...message,
              status: 'complete',
              parts,
              usage,
            };
          }));
        },
      }, controller.signal);

      if (isCurrentRun()) {
        updateMessages(threadId, (current) => current.map((message) => (
          message.id === assistantId
            ? {
                ...message,
                status: 'complete',
                parts: (message.parts || []).map((p) => (
                  p.type === 'reasoning' && p.status === 'streaming' ? { ...p, status: 'complete' as const } : p
                )),
              }
            : message
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
              parts: (message.parts || []).map((p) => (
                p.type === 'reasoning' && p.status === 'streaming' ? { ...p, status: 'stopped' as const } : p
              )),
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
        activeRequestIdRef.current = null;
        setIsStreaming(false);

        // Check if there are queued items to drain next in FIFO order (only if not cancelled)
        if (!controller.signal.aborted) {
          const currentQueue = pendingMessagesRef.current;
          if (currentQueue.length > 0) {
            const steerIdx = currentQueue.findIndex((m) => m.lane === 'steer');
            const pickIdx = steerIdx >= 0 ? steerIdx : 0;
            const nextItem = currentQueue[pickIdx];
            const remainingQueue = currentQueue.filter((_, idx) => idx !== pickIdx);
            updatePendingQueue(threadId, remainingQueue);
            if (fileId) {
              savePendingQueue(fileId, threadId, remainingQueue);
            }
            void executePrompt(nextItem.prompt, nextItem.context);
          }
        }
      }
    }
  }, [
    abcCode,
    isStreaming,
    durableHydrationPending,
    activeThread,
    providerReady,
    captureContext,
    fileId,
    getAgent,
    effectiveThinkingLevel,
    updateMessages,
    updatePendingQueue,
    queueAdapter,
  ]);

  const handlePrioritySteer = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const steerContext = captureContext();
    const steerMsgId = `steer-${makeId()}`;

    if (isStreaming && activeRequestIdRef.current) {
      try {
        const result = await getAgent().steer(activeRequestIdRef.current, {
          messageId: steerMsgId,
          question: trimmed,
          context: steerContext,
        });
        if (result.steered) {
          return;
        }
      } catch {
        // Race occurred or steer rejected
      }
    }

    if (isStreaming) {
      // If active run ended or steer failed mid-race, add to front of FIFO queue
      const existingQueue = queueAdapter.rawItems;
      const newItem: QueuedChatMessage = {
        id: steerMsgId,
        prompt: trimmed,
        lane: 'queue',
        createdAt: new Date().toISOString(),
        context: steerContext,
      };
      if (fileId && activeThread?.id) {
        const nextQueue = [newItem, ...existingQueue];
        updatePendingQueue(activeThread.id, nextQueue);
        savePendingQueue(fileId, activeThread.id, nextQueue);
      }
    } else {
      void executePrompt(trimmed, steerContext);
    }
  }, [
    captureContext,
    isStreaming,
    getAgent,
    queueAdapter.rawItems,
    fileId,
    activeThread?.id,
    updatePendingQueue,
    executePrompt,
  ]);

  const handleEnqueueFollowUp = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    queueAdapter.enqueue({ content: [{ type: 'text', text: trimmed }] });
  }, [queueAdapter]);

  const handleSteerNow = useCallback(async (item: QueuedChatMessage) => {
    if (isStreaming && activeRequestIdRef.current) {
      try {
        const res = await getAgent().steer(activeRequestIdRef.current, {
          messageId: item.id,
          question: item.prompt,
          context: item.context,
        });
        if (res.steered) {
          queueAdapter.remove(item.id);
          return;
        }
      } catch {
        // Race
      }
    }
    // If run ended during steer race, move item to front of FIFO queue
    queueAdapter.move(item.id, { lane: 'queue', insertBefore: queueAdapter.items[0]?.id });
  }, [isStreaming, getAgent, queueAdapter]);

  const storeAdapter = useMemo(
    () => createChoraleExternalStoreAdapter({
      messages: activeThread?.messages ?? [],
      isRunning: isStreaming,
      onNew: async (msg) => {
        const text = typeof msg.content === 'string'
          ? msg.content
          : msg.content.filter((p) => p.type === 'text').map((p) => (p as any).text).join('\n');
        if (text) void executePrompt(text);
      },
      onCancel: async () => {
        stop();
      },
      queue: queueAdapter,
    }),
    [activeThread?.messages, isStreaming, queueAdapter, executePrompt, stop],
  );

  const runtime = useExternalStoreRuntime(storeAdapter);

  if (!open) return null;

  const conversationTotalTokens = getConversationTotalTokens(activeThread);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside
        className="agent-panel"
        aria-label="Current sheet assistant"
        aria-busy={durableHydrationPending}
        inert={durableHydrationPending}
        ref={panelRef}
      >
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

        <ThreadPrimitive.Root className="agent-chat-thread" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <ThreadPrimitive.Viewport
            className="agent-transcript"
            ref={transcriptRef}
            role="log"
            aria-live="polite"
            autoScroll
            turnAnchor="bottom"
          >
            <MemoizedMessageList
              messages={messages}
              scoreMeter={scoreMeter}
              totalMeasures={totalMeasures}
              invalidProposalIds={invalidProposalIds}
              editingProposal={editingProposal}
              conversationTotalTokens={conversationTotalTokens}
              abcCode={abcCode}
              onNavigateMeasure={onNavigateMeasure}
              onEditProposal={handleEditProposal}
              onRejectProposal={handleRejectProposal}
              onApplyAll={handleApplyAll}
              onPreviewScoreProposal={handlePreviewScoreProposal}
              onApplyScoreProposal={handleApplyScoreProposal}
              onDiscardScoreProposal={handleDiscardScoreProposal}
              onStartEditProposal={handleStartEditProposal}
              onReturnToProposalEdit={returnToProposalEdit}
              onSetDraft={(text) => composerRef.current?.setDraft(text)}
            />

            {pendingMessages.length > 0 && (
              <ChoraleQueueList
                items={pendingMessages}
                isRunning={isStreaming}
                onRunNext={(item) => void executePrompt(item.prompt, item.context)}
                onSteerNow={handleSteerNow}
                onEdit={(itemId, newPrompt) => queueAdapter.edit(itemId, { content: [{ type: 'text', text: newPrompt }] })}
                onRemove={(itemId) => queueAdapter.remove(itemId)}
                onReorder={(itemId, direction) => queueAdapter.reorder(itemId, direction)}
              />
            )}
          </ThreadPrimitive.Viewport>

          {error && <div className="agent-error" role="alert">{error}</div>}

          <ChoraleComposer
            ref={composerRef}
            abcCode={abcCode}
            isStreaming={isStreaming}
            providerReady={providerReady}
            ai={ai}
            selectedConnection={selectedConnection}
            selectedModel={selectedModel}
            selectedModels={selectedModels}
            effectiveThinkingLevel={effectiveThinkingLevel}
            supportedThinkingLevels={supportedThinkingLevels}
            modelSupportsThinking={modelSupportsThinking}
            anchorLabel={anchorLabel}
            onClearAnchor={onClearAnchor}
            onOpenSettings={onOpenSettings}
            onSend={(text) => void executePrompt(text)}
            onPrioritySteer={(text) => void handlePrioritySteer(text)}
            onEnqueue={handleEnqueueFollowUp}
            onStop={stop}
            onThinkingLevelChange={setThinkingLevel}
            onConnectionChange={chooseConnection}
            onModelChange={async (modelId) => {
              if (selectedConnection) {
                await ai.setSelection({
                  connectionId: selectedConnection.id,
                  modelId,
                });
              }
            }}
          />
        </ThreadPrimitive.Root>
      </aside>
    </AssistantRuntimeProvider>
  );
};
