import type { AIProviderKind } from './aiTypes';
import type {
  AgentProfileId,
  Annotation,
  AnnotationProposal,
  ScoreAnchor,
  ScoreChangeProposal,
} from '../types/document';

export type ChatToolDisplay = {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'success' | 'error';
  summary: string;
  durationMs?: number;
  startTime?: string;
  endTime?: string;
};

export type RoundUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
  totalTokens: number;
};

export type ChatTextPart = {
  type: 'text';
  text: string;
};

export type ChatReasoningPart = {
  type: 'reasoning';
  text: string;
  status?: 'streaming' | 'complete' | 'stopped';
};

export type ChatToolPart = {
  type: 'tool';
  toolCallId: string;
  toolName: string;
  summary: string;
  status: 'running' | 'success' | 'error';
  durationMs?: number;
  startTime?: string;
  endTime?: string;
};

export type ChatMessagePart = ChatTextPart | ChatReasoningPart | ChatToolPart;

export type MusicContextSnapshot = Readonly<{
  id: string;
  documentId: string;
  revision: number;
  capturedAt: string;
  fileName: string;
  abc: string;
  selection?: Readonly<ScoreAnchor>;
  annotations: readonly Annotation[];
}>;

export type QueuedChatMessage = {
  id: string;
  prompt: string;
  lane: 'queue' | 'steer';
  createdAt: string;
  context: MusicContextSnapshot;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  context?: MusicContextSnapshot;
  status?: 'streaming' | 'complete' | 'stopped' | 'error';
  parts?: ChatMessagePart[];
  usage?: RoundUsage;
  profileRoutes?: AgentProfileId[];
  toolDisplays?: ChatToolDisplay[];
  proposals?: AnnotationProposal[];
  scoreProposals?: ScoreChangeProposal[];
  provider?: {
    connectionId: string;
    providerKind: AIProviderKind;
    modelId: string;
  };
};

// Kept for the explicitly injected faux-agent test helper. Production chat uses
// the Electron bridge and never instantiates that helper.
export type AgentResponseCallbacks = {
  onDelta(delta: string): void;
};

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  pendingMessages?: QueuedChatMessage[];
};

export type PersistedFileConversation = {
  activeThreadId: string;
  threads: ChatThread[];
};

export type PersistedConversationStore = {
  version: 4;
  files: Record<string, PersistedFileConversation>;
};
