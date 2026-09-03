import { randomUUID } from 'node:crypto';
import type {
  AIConnectionPublic,
  AIEvent,
  AIModelOption,
  AISelection,
  SaveAIConnectionInput,
  SheetAgentRequest,
  SheetAgentSteerRequest,
} from '../../src/agent/aiTypes';
import type { AIConnectionStore } from './connectionStore';
import {
  queryModels,
  validateCustomBaseUrl,
  validateCustomHeaders,
} from './providers';
import { SheetAgentRun } from './sheetAgentRuntime';
import type { CodexOAuthAdapter } from './codexOAuth';
import type { AgentTraceStore } from './agentTrace';

type OAuthFlow = {
  controller: AbortController;
};

const sanitizeConnectionInput = (input: SaveAIConnectionInput): SaveAIConnectionInput => {
  const name = input.name?.trim();
  if (!name || name.length > 80) throw new Error('Enter a connection name up to 80 characters.');
  if (input.apiKey !== undefined && input.apiKey.trim().length > 4096) {
    throw new Error('The API key is too long.');
  }
  return {
    ...input,
    name,
    baseUrl: input.kind === 'custom'
      ? validateCustomBaseUrl(input.baseUrl || '')
      : undefined,
    headers: input.kind === 'custom'
      ? validateCustomHeaders(input.headers)
      : undefined,
    clearHeaders: input.kind === 'custom' && input.clearHeaders === true,
  };
};

export class AIController {
  private readonly activeRuns = new Map<string, SheetAgentRun>();
  private readonly oauthFlows = new Map<string, OAuthFlow>();

  private readonly store: AIConnectionStore;
  private readonly codexOAuth: CodexOAuthAdapter;
  private readonly traceStore?: AgentTraceStore;
  private readonly openDirectory?: (directory: string) => Promise<string>;

  constructor(
    store: AIConnectionStore,
    codexOAuth: CodexOAuthAdapter,
    traceStore?: AgentTraceStore,
    openDirectory?: (directory: string) => Promise<string>,
  ) {
    this.store = store;
    this.codexOAuth = codexOAuth;
    this.traceStore = traceStore;
    this.openDirectory = openDirectory;
  }

  listConnections() {
    return this.store.listConnections();
  }

  async saveConnection(input: SaveAIConnectionInput) {
    const sanitized = sanitizeConnectionInput(input);
    const existing = sanitized.id
      ? this.store.getConnection(sanitized.id)
      : undefined;
    if (sanitized.id && !existing) throw new Error('AI connection not found.');
    if (existing?.kind === 'openai-codex') {
      throw new Error('OpenAI Codex connections must be created through OAuth.');
    }

    const existingSecret = sanitized.id
      ? this.store.getSecret(sanitized.id)
      : undefined;
    const apiKey = sanitized.apiKey?.trim() || existingSecret?.apiKey;
    if (!apiKey) throw new Error('An API key is required.');
    const headers = sanitized.clearHeaders
      ? undefined
      : sanitized.headers ?? existingSecret?.headers;
    const candidate: AIConnectionPublic = {
      id: sanitized.id ?? 'pending-connection',
      name: sanitized.name,
      kind: sanitized.kind,
      baseUrl: sanitized.baseUrl,
      authType: 'api-key',
      persistence: existing?.persistence ?? 'session-only',
      status: 'ready',
      lastValidatedAt: existing?.lastValidatedAt,
      modelsUpdatedAt: existing?.modelsUpdatedAt,
    };

    const models = await queryModels(candidate, { apiKey, headers });
    if (models.length === 0) throw new Error('The provider returned no compatible models.');

    const saved = await this.store.saveConnection(sanitized);
    await this.store.updateModels(saved.id, models);
    return this.store.getConnection(saved.id) ?? saved;
  }

  async deleteConnection(id: string) {
    this.assertConnectionId(id);
    await this.store.deleteConnection(id);
  }

  getCachedModels(id: string) {
    this.assertConnectionId(id);
    return this.store.getModels(id);
  }

  async refreshModels(id: string, signal?: AbortSignal): Promise<AIModelOption[]> {
    this.assertConnectionId(id);
    const connection = this.store.getConnection(id);
    const secret = this.store.getSecret(id);
    if (!connection || !secret) throw new Error('AI connection is unavailable.');
    try {
      const models = await queryModels(connection, secret, signal);
      if (models.length === 0) throw new Error('The provider returned no compatible models.');
      await this.store.updateModels(id, models);
      return models;
    } catch (error) {
      await this.store.markStatus(id, 'invalid');
      throw error;
    }
  }

  getSelection() {
    return this.store.getSelection();
  }

  async setSelection(selection: AISelection | null) {
    if (selection) {
      this.assertConnectionId(selection.connectionId);
      if (!selection.modelId || selection.modelId.length > 300) {
        throw new Error('Select a valid model.');
      }
    }
    await this.store.setSelection(selection);
  }

  async openTraceDirectory() {
    if (!this.traceStore || !this.openDirectory) {
      throw new Error('Agent traces are available in the Chorale desktop app.');
    }
    await this.traceStore.ensureDirectory();
    const error = await this.openDirectory(this.traceStore.directory);
    if (error) throw new Error(`Could not open the agent trace folder: ${error}`);
  }

  async logoutConnection(id: string) {
    this.assertConnectionId(id);
    await this.store.deleteConnection(id);
  }

  startCodexLogin(emit: (event: AIEvent) => void) {
    const flowId = randomUUID();
    const controller = new AbortController();
    this.oauthFlows.set(flowId, { controller });
    emit({ type: 'oauth-update', flowId, status: 'starting' });

    void this.runCodexLogin(flowId, controller, emit);
    return { flowId };
  }

  private async runCodexLogin(
    flowId: string,
    controller: AbortController,
    emit: (event: AIEvent) => void,
  ) {
    try {
      const result = await this.codexOAuth.login(controller.signal, (details) => {
        emit({
          type: 'oauth-update',
          flowId,
          status: 'pending',
          details,
        });
        if (details.verificationUri) {
          void this.codexOAuth.openVerificationUrl(details.verificationUri).catch((error) => {
            emit({
              type: 'oauth-update',
              flowId,
              status: 'pending',
              details: {
                message: `Open the verification URL manually (${error instanceof Error ? error.message : 'browser unavailable'}).`,
              },
            });
          });
        }
      });
      const connection = await this.store.saveOAuthConnection(result.credential, result.models);
      emit({
        type: 'oauth-update',
        flowId,
        status: 'complete',
        details: { connection },
      });
    } catch (error) {
      emit({
        type: 'oauth-update',
        flowId,
        status: controller.signal.aborted ? 'cancelled' : 'error',
        details: {
          message: error instanceof Error ? error.message : 'OpenAI Codex login failed.',
        },
      });
    } finally {
      this.oauthFlows.delete(flowId);
    }
  }

  cancelCodexLogin(flowId: string) {
    const flow = this.oauthFlows.get(flowId);
    if (!flow) throw new Error('OAuth flow not found.');
    flow.controller.abort();
    this.oauthFlows.delete(flowId);
  }

  sendChat(request: SheetAgentRequest, emit: (event: AIEvent) => void) {
    if (!request.question.trim() || !request.context.abc.trim()) {
      throw new Error('A question and current score are required.');
    }
    const selection = this.store.getSelection();
    if (!selection) throw new Error('Select an AI provider and model before sending.');
    const connection = this.store.getConnection(selection.connectionId);
    const model = this.store.getModels(selection.connectionId)
      .find((candidate) => candidate.id === selection.modelId);
    if (!connection || !model || connection.status !== 'ready') {
      throw new Error('The selected AI provider or model is unavailable.');
    }

    const requestId = randomUUID();
    const run = new SheetAgentRun(
      requestId,
      request,
      connection,
      model,
      this.store,
      emit,
      this.traceStore,
    );
    this.activeRuns.set(requestId, run);
    void run.start().finally(() => this.activeRuns.delete(requestId));
    return { requestId };
  }

  abortChat(requestId: string) {
    const run = this.activeRuns.get(requestId);
    if (!run) throw new Error('Chat request not found.');
    run.abort();
  }

  async steerChat(requestId: string, steer: SheetAgentSteerRequest): Promise<{ steered: boolean }> {
    const run = this.activeRuns.get(requestId);
    if (!run) return { steered: false };
    return run.steer(steer);
  }

  abortAll() {
    for (const run of this.activeRuns.values()) run.abort();
    for (const flow of this.oauthFlows.values()) flow.controller.abort();
    this.activeRuns.clear();
    this.oauthFlows.clear();
  }

  private assertConnectionId(id: string): AIConnectionPublic {
    if (!id || id.length > 100) throw new Error('Invalid AI connection ID.');
    const connection = this.store.getConnection(id);
    if (!connection) throw new Error('AI connection not found.');
    return connection;
  }
}
