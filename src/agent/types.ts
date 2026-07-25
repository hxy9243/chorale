export type MusicAnnotation = {
  id: string;
  kind: 'chord' | 'phrase' | 'harmony' | 'fingering' | 'comment' | string;
  label: string;
  description?: string;
  measureStart?: number;
  measureEnd?: number;
  abcRange?: { start: number; end: number };
};

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
  annotations?: MusicAnnotation[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  context?: MusicContextSnapshot;
  status?: 'streaming' | 'complete' | 'stopped' | 'error';
};

export type PersistedConversation = {
  version: 1;
  messages: ChatMessage[];
};

export type AgentResponseCallbacks = {
  onDelta: (delta: string) => void;
};
