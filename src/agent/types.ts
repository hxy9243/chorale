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
};

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

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  context?: MusicContextSnapshot;
  status?: 'streaming' | 'complete' | 'stopped' | 'error';
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
};

export type PersistedFileConversation = {
  activeThreadId: string;
  threads: ChatThread[];
};

export type PersistedConversationStore = {
  version: 3;
  files: Record<string, PersistedFileConversation>;
};
