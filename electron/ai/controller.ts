import { randomUUID } from 'node:crypto';
import type {
  AIConnectionPublic,
  AIEvent,
  AIModelOption,
  AISelection,
  SaveAIConnectionInput,
  SheetAgentRequest,
} from '../../src/agent/aiTypes';
import type { AIConnectionStore } from './connectionStore';
import {
  queryModels,
  validateCustomBaseUrl,
  validateCustomHeaders,
} from './providers';
import { SheetAgentRun } from './sheetAgentRuntime';
import type { CodexOAuthAdapter } from './codexOAuth';

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
  };
};

export class AIController {
  private readonly activeRuns = new Map<string, SheetAgentRun>();
  private readonly oauthFlows = new Map<string, OAuthFlow>();

  private readonly store: AIConnectionStore;
  private readonly codexOAuth: CodexOAuthAdapter;

  constructor(store: AIConnectionStore, codexOAuth: CodexOAuthAdapter) {
    this.store = store;
    this.codexOAuth = codexOAuth;
  }

  listConnections() {
    return this.store.listConnections();
  }

  async saveConnection(input: SaveAIConnectionInput) {
    return this.store.saveConnection(sanitizeConnectionInput(input));
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
