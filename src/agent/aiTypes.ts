import type { ChatMessage, MusicContextSnapshot } from './types';
import type { AgentProfileId } from '../types/document';

export const AI_PROVIDER_KINDS = [
  'openai-codex',
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'custom',
] as const;

export type AIProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export type AIConnectionStatus = 'ready' | 'invalid' | 'expired' | 'unavailable';

export type AIConnectionPublic = {
  id: string;
  name: string;
  kind: AIProviderKind;
  baseUrl?: string;
  authType: 'api-key' | 'oauth';
  persistence: 'encrypted' | 'session-only';
  status: AIConnectionStatus;
  lastValidatedAt?: string;
  modelsUpdatedAt?: string;
};

export type AIModelOption = {
  id: string;
  name: string;
  source: 'live' | 'pi-catalog';
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
};

export type AISelection = {
  connectionId: string;
  modelId: string;
};

export type SaveAIConnectionInput = {
  id?: string;
  name: string;
  kind: Exclude<AIProviderKind, 'openai-codex'>;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  clearHeaders?: boolean;
};

export type SheetAgentRequest = {
  history: ChatMessage[];
  question: string;
  context: MusicContextSnapshot;
};

export type AIErrorCode =
  | 'desktop_required'
  | 'invalid_request'
  | 'not_configured'
  | 'auth'
  | 'model'
  | 'rate_limit'
  | 'network'
  | 'provider'
  | 'aborted'
  | 'storage';

export type OAuthUpdateDetails = {
  verificationUri?: string;
  userCode?: string;
  expiresInSeconds?: number;
  message?: string;
  connection?: AIConnectionPublic;
};

export type AIEvent =
  | {
      type: 'chat-start';
      requestId: string;
      connectionId: string;
      modelId: string;
      providerKind: AIProviderKind;
    }
  | { type: 'chat-delta'; requestId: string; text: string }
  | { type: 'profile-route'; requestId: string; profiles: AgentProfileId[] }
  | {
      type: 'tool-start';
      requestId: string;
      toolCallId: string;
      toolName: string;
      summary: string;
    }
  | {
      type: 'tool-done';
      requestId: string;
      toolCallId: string;
      toolName: string;
      status: 'success' | 'error';
      summary: string;
    }
  | { type: 'chat-done'; requestId: string }
  | { type: 'chat-error'; requestId: string; code: AIErrorCode; message: string }
  | {
      type: 'oauth-update';
      flowId: string;
      status: 'starting' | 'pending' | 'complete' | 'cancelled' | 'error';
      details?: OAuthUpdateDetails;
    };

export type ChoraleAIBridge = {
  listConnections(): Promise<AIConnectionPublic[]>;
  saveConnection(input: SaveAIConnectionInput): Promise<AIConnectionPublic>;
  deleteConnection(connectionId: string): Promise<void>;
  refreshModels(connectionId: string): Promise<AIModelOption[]>;
  getCachedModels(connectionId: string): Promise<AIModelOption[]>;
  getSelection(): Promise<AISelection | null>;
  setSelection(selection: AISelection | null): Promise<void>;
  startCodexLogin(): Promise<{ flowId: string }>;
  cancelCodexLogin(flowId: string): Promise<void>;
  logoutConnection(connectionId: string): Promise<void>;
  sendChat(request: SheetAgentRequest): Promise<{ requestId: string }>;
  abortChat(requestId: string): Promise<void>;
  onAIEvent(listener: (event: AIEvent) => void): () => void;
};

export const isAIProviderKind = (value: unknown): value is AIProviderKind => (
  typeof value === 'string' && AI_PROVIDER_KINDS.includes(value as AIProviderKind)
);
