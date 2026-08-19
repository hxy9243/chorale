import { Agent, type AgentEvent } from '@earendil-works/pi-agent-core';
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
import { AGENT_PROFILE_REGISTRY } from './agentProfiles';
import type { AgentTraceRun, AgentTraceStore } from './agentTrace';

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

const describeModel = (model: {
  id: string;
  name: string;
  provider: string;
  api: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}) => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
  api: model.api,
  reasoning: model.reasoning,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
});

const describeTools = (tools: ReturnType<typeof createSheetTools>['tools']) => tools.map((tool) => ({
  name: tool.name,
  label: tool.label,
  description: tool.description,
  parameters: tool.parameters,
  executionMode: tool.executionMode ?? 'parallel',
}));

const summarizeResponseHeaders = (headers: Record<string, string>) => Object.fromEntries(
  Object.entries(headers).map(([name, value]) => [
    name,
    /authorization|cookie|api-key|token/i.test(name) ? '[redacted]' : value,
  ]),
);

const shouldPersistAgentEvent = (event: AgentEvent) => event.type !== 'message_update';

export const projectAssistantDelta = (event: AgentEvent): string | undefined => {
  if (event.type !== 'message_update') return undefined;
  const update = event.assistantMessageEvent;
  if (update.type === 'text_delta') return update.delta;
  if (update.type === 'thinking_end' && update.content.trim()) {
    return `<think>\n${update.content}\n</think>\n\n`;
  }
  return undefined;
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
  private readonly traceStore?: AgentTraceStore;

  constructor(
    requestId: string,
    request: SheetAgentRequest,
    connection: AIConnectionPublic,
    modelOption: AIModelOption,
    store: AIConnectionStore,
    emit: (event: AIEvent) => void,
    traceStore?: AgentTraceStore,
  ) {
    this.requestId = requestId;
    this.request = request;
    this.connection = connection;
    this.modelOption = modelOption;
    this.store = store;
    this.emit = emit;
    this.traceStore = traceStore;
    this.scoreSnapshot = createScoreSnapshot({
      snapshotId: request.context.id,
      documentId: request.context.documentId,
      revision: request.context.revision,
      abc: request.context.abc,
      annotations: request.context.annotations,
    });
    this.sheetTools = createSheetTools(this.scoreSnapshot, {
      runId: this.requestId,
      onProfileRoute: (profiles) => {
        if (!this.cancelled) {
          this.emit({
            type: 'profile-route',
            requestId: this.requestId,
            profiles: [...profiles],
          });
        }
      },
      onProposalCreated: (proposal) => {
        if (!this.cancelled) {
          this.emit({
            type: 'proposal-created',
            requestId: this.requestId,
            proposal,
          });
        }
      },
    });
  }

  async start() {
    const { models, model } = createProviderRuntime(this.connection, this.modelOption, this.store);
    const thinkingLevel = model.reasoning ? this.request.thinkingLevel : 'off';
    const initialHistory = toAgentHistory(this.request.history, model, this.scoreSnapshot);
    const currentPrompt = formatPrompt(this.request.question, this.request.context, this.scoreSnapshot);
    let trace: AgentTraceRun | undefined;
    try {
      trace = await this.traceStore?.createRun(
        this.requestId,
        (serialized) => redactSecretValues(
          serialized,
          this.store.getSecret(this.connection.id),
        ),
      );
      await trace?.append('run-start', {
        traceFile: trace.filePath,
        agent: {
          name: 'Chorale Music Tutor',
          implementation: '@earendil-works/pi-agent-core/Agent',
          topology: 'one agent per request; analysis profiles are selected through a tool',
        },
        connection: this.connection,
        model: describeModel(model),
        modelSelection: this.modelOption,
        thinkingLevel,
        requestedThinkingLevel: this.request.thinkingLevel,
        systemPrompt: SHEET_AGENT_SYSTEM_PROMPT,
        profiles: Object.values(AGENT_PROFILE_REGISTRY),
        tools: describeTools(this.sheetTools.tools),
        initialHistory,
        currentPrompt,
        musicContext: this.request.context,
      });
    } catch (error) {
      console.warn('Could not start agent trace logging:', error);
    }

    const agent = new Agent({
      initialState: {
        systemPrompt: SHEET_AGENT_SYSTEM_PROMPT,
        model,
        thinkingLevel,
        messages: initialHistory,
        tools: [...this.sheetTools.tools],
      },
      onPayload: async (payload, activeModel) => {
        await trace?.append('provider-request', {
          model: describeModel(activeModel),
          payload,
        });
      },
      onResponse: async (response, activeModel) => {
        await trace?.append('provider-response', {
          model: describeModel(activeModel),
          status: response.status,
          headers: summarizeResponseHeaders(response.headers),
        });
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

    const unsubscribe = agent.subscribe(async (event) => {
      if (shouldPersistAgentEvent(event)) {
        await trace?.append('agent-event', event);
      }
      if (
        (event.type === 'tool_execution_start' || event.type === 'tool_execution_end')
        && !this.cancelled
      ) {
        this.emit(projectToolLifecycleEvent(this.requestId, event));
      }
      const assistantDelta = projectAssistantDelta(event);
      if (assistantDelta !== undefined && !this.cancelled) {
        this.emit({
          type: 'chat-delta',
          requestId: this.requestId,
          text: assistantDelta,
        });
      }
    });

    let outcome: Record<string, unknown> = { status: 'complete' };
    try {
      await agent.prompt(currentPrompt);
      if (this.cancelled) throw new DOMException('The response was stopped.', 'AbortError');
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
      this.emit({ type: 'chat-done', requestId: this.requestId });
    } catch (error) {
      const mapped = mapAgentError(error);
      outcome = { status: mapped.code === 'aborted' ? 'aborted' : 'error', error, mapped };
      this.emit({
        type: 'chat-error',
        requestId: this.requestId,
        code: mapped.code,
        message: redactSecretValues(mapped.message, this.store.getSecret(this.connection.id)),
      });
    } finally {
      await trace?.append('run-end', {
        ...outcome,
        selectedProfiles: this.sheetTools.state.selectedProfiles,
        messages: agent.state.messages,
      });
      await trace?.close();
      unsubscribe();
      this.agent = undefined;
    }
  }

  abort() {
    this.cancelled = true;
    this.agent?.abort();
  }
}
