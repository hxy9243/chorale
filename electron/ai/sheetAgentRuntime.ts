import { Agent } from '@earendil-works/pi-agent-core';
import type {
  AIConnectionPublic,
  AIErrorCode,
  AIEvent,
  AIModelOption,
  SheetAgentRequest,
} from '../../src/agent/aiTypes';
import type { AIConnectionStore } from './connectionStore';
import { createProviderRuntime } from './providers';
import { formatPrompt, toAgentHistory } from '../../src/agent/promptUtils';
import {
  createScoreSnapshot,
  type ScoreSnapshot,
} from '../../src/music/scoreSnapshot';
import { createSheetTools } from './sheetTools';
import { SHEET_AGENT_SYSTEM_PROMPT } from './systemPrompt';
import { projectToolLifecycleEvent } from './toolEvents';

export const mapAgentError = (error: unknown): { code: AIErrorCode; message: string } => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'aborted', message: 'The response was stopped.' };
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('401') || normalized.includes('unauthorized') || normalized.includes('api key')) {
    return { code: 'auth', message };
  }
  if (normalized.includes('429') || normalized.includes('rate limit')) {
    return { code: 'rate_limit', message };
  }
  if (normalized.includes('model')) return { code: 'model', message };
  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('connect')) {
    return { code: 'network', message };
  }
  return { code: 'provider', message };
};

const collectSecretValues = (value: unknown, values: Set<string>) => {
  if (typeof value === 'string') {
    if (value.length >= 4) values.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSecretValues(item, values));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectSecretValues(item, values));
  }
};

export const redactSecretValues = (message: string, secret: unknown): string => {
  const values = new Set<string>();
  collectSecretValues(secret, values);
  return [...values]
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, value) => redacted.split(value).join('[redacted]'), message);
};

export class SheetAgentRun {
  readonly scoreSnapshot: ScoreSnapshot;
  readonly sheetTools: ReturnType<typeof createSheetTools>;
  private agent?: Agent;
  private cancelled = false;
  private readonly requestId: string;
  private readonly request: SheetAgentRequest;
  private readonly connection: AIConnectionPublic;
  private readonly modelOption: AIModelOption;
  private readonly store: AIConnectionStore;
  private readonly emit: (event: AIEvent) => void;

  constructor(
    requestId: string,
    request: SheetAgentRequest,
    connection: AIConnectionPublic,
    modelOption: AIModelOption,
    store: AIConnectionStore,
    emit: (event: AIEvent) => void,
  ) {
    this.requestId = requestId;
    this.request = request;
    this.connection = connection;
    this.modelOption = modelOption;
    this.store = store;
    this.emit = emit;
    this.scoreSnapshot = createScoreSnapshot({
      snapshotId: request.context.id,
      documentId: request.context.documentId,
      revision: request.context.revision,
      abc: request.context.abc,
      annotations: request.context.annotations,
    });
    this.sheetTools = createSheetTools(this.scoreSnapshot, {
      onProfileRoute: (profiles) => {
        if (!this.cancelled) {
          this.emit({
            type: 'profile-route',
            requestId: this.requestId,
            profiles: [...profiles],
          });
        }
      },
    });
  }

  async start() {
    const { models, model } = createProviderRuntime(this.connection, this.modelOption, this.store);
    const agent = new Agent({
      initialState: {
        systemPrompt: SHEET_AGENT_SYSTEM_PROMPT,
        model,
        thinkingLevel: 'off',
        messages: toAgentHistory(this.request.history, model),
        tools: [...this.sheetTools.tools],
      },
      streamFn: (activeModel, context, options) => (
        models.streamSimple(activeModel, context, options)
      ),
    });
    this.agent = agent;

    this.emit({
      type: 'chat-start',
      requestId: this.requestId,
      connectionId: this.connection.id,
      modelId: model.id,
      providerKind: this.connection.kind,
    });

    const unsubscribe = agent.subscribe((event) => {
      if (
        (event.type === 'tool_execution_start' || event.type === 'tool_execution_end')
        && !this.cancelled
      ) {
        this.emit(projectToolLifecycleEvent(this.requestId, event));
      }
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta' &&
        !this.cancelled
      ) {
        this.emit({
          type: 'chat-delta',
          requestId: this.requestId,
          text: event.assistantMessageEvent.delta,
        });
      }
    });

    try {
      await agent.prompt(formatPrompt(this.request.question, this.request.context));
      if (this.cancelled) throw new DOMException('The response was stopped.', 'AbortError');
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
      this.emit({ type: 'chat-done', requestId: this.requestId });
    } catch (error) {
      const mapped = mapAgentError(error);
      this.emit({
        type: 'chat-error',
        requestId: this.requestId,
        code: mapped.code,
        message: redactSecretValues(mapped.message, this.store.getSecret(this.connection.id)),
      });
    } finally {
      unsubscribe();
      this.agent = undefined;
    }
  }

  abort() {
    this.cancelled = true;
    this.agent?.abort();
  }
}
