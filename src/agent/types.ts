import type { AIProviderKind } from './aiTypes';
import type { Annotation } from '../types/document';

export type MusicContextSnapshot = {
  id: string;
  revision: number;
  capturedAt: string;
  fileName: string;
  abc: string;
  selection?: {
    measureStart?: number;
    measureEnd?: number;
    abcRange?: { start: number; end: number };
  };
  annotations?: Annotation[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  context?: MusicContextSnapshot;
  status?: 'streaming' | 'complete' | 'stopped' | 'error';
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
  version: 2;
  files: Record<string, PersistedFileConversation>;
};
