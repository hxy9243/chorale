import { Agent, type AgentEvent, type AgentMessage } from '@earendil-works/pi-agent-core';
import type {
  AIConnectionPublic,
  AIErrorCode,
  AIEvent,
  AIModelOption,
  SheetAgentRequest,
  SheetAgentSteerRequest,
} from '../../src/agent/aiTypes';
import type { RoundUsage } from '../../src/agent/types';
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

export const SHEET_AGENT_MAX_COMPLETION_TOKENS = 16_384;

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

export const createAssistantDeltaProjector = () => {
  const streamedThinking = new Map<number, string>();

  return (event: AgentEvent): string | undefined => {
    if (event.type !== 'message_update') return undefined;
    const update = event.assistantMessageEvent;
    if (update.type === 'text_delta') return update.delta;
    if (update.type === 'thinking_start') {
      streamedThinking.set(update.contentIndex, '');
      return '<think>\n';
    }
    if (update.type === 'thinking_delta') {
      if (streamedThinking.has(update.contentIndex)) {
        streamedThinking.set(
          update.contentIndex,
          `${streamedThinking.get(update.contentIndex) ?? ''}${update.delta}`,
        );
      }
      return update.delta;
    }
    if (update.type === 'thinking_end') {
      const streamed = streamedThinking.get(update.contentIndex);
      streamedThinking.delete(update.contentIndex);
      if (streamed === undefined) {
        return update.content.trim()
          ? `<think>\n${update.content}\n</think>\n\n`
          : undefined;
      }
      const remainder = update.content.startsWith(streamed)
        ? update.content.slice(streamed.length)
        : '';
      return `${remainder}\n</think>\n\n`;
    }
    return undefined;
  };
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

  private pendingDeltas: Array<{ partType: 'text' | 'reasoning'; text: string; partId?: string }> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private toolStarts = new Map<string, { hr: number; iso: string }>();

  private accumulatedUsage: RoundUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
  };
  private hasUsage = false;
  private seenUsageMessages = new Set<unknown>();
  private acceptingSteers = false;

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
      selection: this.request.context.selection,
      onProfileRoute: (profiles) => {
        if (!this.cancelled) {
          this.flushDeltas();
          this.emit({
            type: 'profile-route',
            requestId: this.requestId,
            profiles: [...profiles],
          });
        }
      },
      onProposalCreated: (proposal) => {
        if (!this.cancelled) {
          this.flushDeltas();
          this.emit({
            type: 'proposal-created',
            requestId: this.requestId,
            proposal,
          });
        }
      },
      onScoreProposalCreated: (proposal) => {
        if (!this.cancelled) {
          this.flushDeltas();
          this.emit({
            type: 'score-proposal-created',
            requestId: this.requestId,
            proposal,
          });
        }
      },
    });
  }

  private queueDelta(partType: 'text' | 'reasoning', text: string, partId?: string) {
    if (this.cancelled || !text) return;
    this.pendingDeltas.push({ partType, text, partId });
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.flushDeltas();
      }, 50);
    }
  }

  flushDeltas() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.pendingDeltas.length === 0) return;

    const deltas = this.pendingDeltas;
    this.pendingDeltas = [];

    let current: { partType: 'text' | 'reasoning'; text: string; partId?: string } | null = null;
    for (const delta of deltas) {
      if (current && current.partType === delta.partType && current.partId === delta.partId) {
        current.text += delta.text;
      } else {
        if (current) {
          this.emit({
            type: 'chat-delta',
            requestId: this.requestId,
            text: current.text,
            partType: current.partType,
            partId: current.partId,
          });
        }
        current = { ...delta };
      }
    }
    if (current) {
      this.emit({
        type: 'chat-delta',
        requestId: this.requestId,
        text: current.text,
        partType: current.partType,
        partId: current.partId,
      });
    }
  }

  private accumulateUsage(u?: Record<string, unknown>, messageIdentity?: unknown) {
    if (!u || typeof u !== 'object') return;
    if (messageIdentity && this.seenUsageMessages.has(messageIdentity)) return;
    if (messageIdentity) this.seenUsageMessages.add(messageIdentity);

    const input = typeof u.input === 'number' ? u.input : 0;
    const output = typeof u.output === 'number' ? u.output : 0;
    const cacheRead = typeof u.cacheRead === 'number' ? u.cacheRead : 0;
    const cacheWrite = typeof u.cacheWrite === 'number' ? u.cacheWrite : 0;
    const reasoning = typeof u.reasoning === 'number' ? u.reasoning : undefined;
    const totalTokens = typeof u.totalTokens === 'number'
      ? u.totalTokens
      : (input + output + cacheRead + cacheWrite);

    this.accumulatedUsage.input += input;
    this.accumulatedUsage.output += output;
    this.accumulatedUsage.cacheRead += cacheRead;
    this.accumulatedUsage.cacheWrite += cacheWrite;
    if (reasoning !== undefined) {
      this.accumulatedUsage.reasoning = (this.accumulatedUsage.reasoning ?? 0) + reasoning;
    }
    this.accumulatedUsage.totalTokens += totalTokens;
    this.hasUsage = true;
  }

  async steer(steer: SheetAgentSteerRequest): Promise<{ steered: boolean }> {
    if (this.cancelled || !this.acceptingSteers || !this.agent?.state.isStreaming) {
      return { steered: false };
    }
    const steerPrompt = formatPrompt(steer.question, steer.context, this.scoreSnapshot);
    const userMessage: AgentMessage = {
      role: 'user',
      content: steerPrompt,
      timestamp: Date.now(),
    };
    this.agent.steer(userMessage);
    this.flushDeltas();
    this.emit({
      type: 'steer-accepted',
      requestId: this.requestId,
      messageId: steer.messageId,
    });
    return { steered: true };
  }

  async start() {
    const { models, model } = createProviderRuntime(this.connection, this.modelOption, this.store);
    const thinkingLevel = model.reasoning ? this.request.thinkingLevel : 'off';
    const initialHistory = toAgentHistory(this.request.history, model);
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
        models.streamSimple(activeModel, context, {
          ...options,
          maxTokens: Math.min(
            options?.maxTokens && options.maxTokens > 0
              ? options.maxTokens
              : activeModel.maxTokens,
            SHEET_AGENT_MAX_COMPLETION_TOKENS,
          ),
        })
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
      // Pi will not poll its steering queue again after agent_end. Close the
      // acknowledgement window before any awaited trace work can yield.
      if (event.type === 'agent_end') this.acceptingSteers = false;
      if (shouldPersistAgentEvent(event)) {
        await trace?.append('agent-event', event);
      }

      if (event.type === 'tool_execution_start') {
        const hr = performance.now();
        const iso = new Date().toISOString();
        this.toolStarts.set(event.toolCallId, { hr, iso });
        if (!this.cancelled) {
          this.flushDeltas();
          this.emit(projectToolLifecycleEvent(this.requestId, event, { startTime: iso }));
        }
      } else if (event.type === 'tool_execution_end') {
        const start = this.toolStarts.get(event.toolCallId);
        const durationMs = start ? Math.max(0, Math.round(performance.now() - start.hr)) : undefined;
        const endTime = new Date().toISOString();
        if (!this.cancelled) {
          this.flushDeltas();
          this.emit(projectToolLifecycleEvent(this.requestId, event, {
            startTime: start?.iso,
            durationMs,
            endTime,
          }));
        }
      } else if (event.type === 'message_update') {
        const update = event.assistantMessageEvent;
        if (update.type === 'text_delta') {
          this.queueDelta('text', update.delta, `part-${update.contentIndex}`);
        } else if (update.type === 'thinking_delta') {
          this.queueDelta('reasoning', update.delta, `part-${update.contentIndex}`);
        }
      } else if (event.type === 'turn_end' && 'message' in event) {
        const msg = event.message as unknown as Record<string, unknown>;
        this.accumulateUsage(msg?.usage as Record<string, unknown>, msg);
      } else if (event.type === 'message_end' && 'message' in event) {
        const msg = event.message as unknown as Record<string, unknown>;
        this.accumulateUsage(msg?.usage as Record<string, unknown>, msg);
      }
    });

    let outcome: Record<string, unknown> = { status: 'complete' };
    try {
      this.acceptingSteers = true;
      await agent.prompt(currentPrompt);
      if (this.cancelled) throw new DOMException('The response was stopped.', 'AbortError');
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);

      // Check for any final assistant message usage
      for (const msg of agent.state.messages) {
        if ((msg as any).role === 'assistant') {
          this.accumulateUsage((msg as any).usage, msg);
        }
      }

      this.flushDeltas();
      this.emit({
        type: 'chat-done',
        requestId: this.requestId,
        usage: this.hasUsage ? { ...this.accumulatedUsage } : undefined,
      });
    } catch (error) {
      this.flushDeltas();
      const mapped = mapAgentError(error);
      outcome = { status: mapped.code === 'aborted' ? 'aborted' : 'error', error, mapped };
      this.emit({
        type: 'chat-error',
        requestId: this.requestId,
        code: mapped.code,
        message: redactSecretValues(mapped.message, this.store.getSecret(this.connection.id)),
      });
    } finally {
      this.acceptingSteers = false;
      this.flushDeltas();
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
    this.flushDeltas();
    this.agent?.abort();
  }
}
