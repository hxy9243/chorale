import {
  createModels,
  createProvider,
  getSupportedThinkingLevels,
  type Api,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type Model,
  type Models,
  type Provider,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import {
  AI_THINKING_LEVELS,
  isAIThinkingLevel,
  type AIConnectionPublic,
  type AIModelOption,
  type AIProviderKind,
  type AIThinkingLevel,
} from '../../src/agent/aiTypes';
import type { AIConnectionStore, ConnectionSecret } from './connectionStore';

const DEFAULT_BASE_URLS: Record<Exclude<AIProviderKind, 'openai-codex' | 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
};

const API_BY_KIND: Record<AIProviderKind, Api> = {
  'openai-codex': 'openai-codex-responses',
  openai: 'openai-responses',
  anthropic: 'anthropic-messages',
  google: 'google-generative-ai',
  openrouter: 'openai-completions',
  custom: 'openai-completions',
};

const PROVIDER_ID_BY_KIND: Record<Exclude<AIProviderKind, 'custom'>, string> = {
  'openai-codex': 'openai-codex',
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  openrouter: 'openrouter',
};

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const isLoopbackHost = (hostname: string) => (
  hostname === 'localhost' ||
  hostname === '::1' ||
  hostname === '[::1]' ||
  /^127\./.test(hostname)
);

export const validateCustomBaseUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid custom provider URL.');
  }
  if (url.username || url.password) {
    throw new Error('Custom provider URLs cannot contain embedded credentials.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error('Custom providers must use HTTPS, except for loopback HTTP endpoints.');
  }
  return normalizeBaseUrl(url.toString());
};

const FORBIDDEN_CUSTOM_HEADERS = new Set([
  'authorization',
  'connection',
  'content-length',
  'host',
  'proxy-authorization',
  'transfer-encoding',
  'x-api-key',
]);

export const validateCustomHeaders = (headers: Record<string, string> | undefined) => {
  if (!headers) return undefined;
  const validated: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim();
    const value = rawValue.trim();
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new Error(`Invalid custom header name: ${rawName}`);
    }
    if (FORBIDDEN_CUSTOM_HEADERS.has(name.toLowerCase())) {
      throw new Error(`Custom header ${name} is managed by Chorale and cannot be overridden.`);
    }
    if (/[\r\n]/.test(value)) throw new Error(`Custom header ${name} contains an invalid newline.`);
    if (value) validated[name] = value;
  }
  return Object.keys(validated).length > 0 ? validated : undefined;
};

const providerForKind = (kind: Exclude<AIProviderKind, 'custom'>): Provider => {
  switch (kind) {
    case 'openai-codex': return openaiCodexProvider();
    case 'openai': return openaiProvider();
    case 'anthropic': return anthropicProvider();
    case 'google': return googleProvider();
    case 'openrouter': return openrouterProvider();
  }
};

const optionFromCatalogModel = (model: Model<Api>, source: AIModelOption['source']): AIModelOption => ({
  id: model.id,
  name: model.name || model.id,
  source,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
  reasoning: model.reasoning,
  thinkingLevels: getSupportedThinkingLevels(model),
});

type UnknownModelInput = {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  thinkingLevels?: AIThinkingLevel[];
};

const thinkingLevelMapFromOption = (
  option: AIModelOption,
): Model<Api>['thinkingLevelMap'] => {
  if (!option.reasoning || !option.thinkingLevels) return undefined;
  const supported = new Set(option.thinkingLevels);
  const map: NonNullable<Model<Api>['thinkingLevelMap']> = {};
  for (const level of AI_THINKING_LEVELS) {
    map[level] = supported.has(level) ? (level === 'off' ? 'none' : level) : null;
  }
  return map;
};

const createRuntimeModel = (
  connection: AIConnectionPublic,
  option: AIModelOption,
  catalog: readonly Model<Api>[],
): Model<Api> => {
  const known = catalog.find((candidate) => candidate.id === option.id);
  if (known) {
    return {
      ...known,
      reasoning: option.reasoning ?? known.reasoning,
      thinkingLevelMap: thinkingLevelMapFromOption(option) ?? known.thinkingLevelMap,
    };
  }

  const provider = connection.kind === 'custom'
    ? `custom-${connection.id}`
    : PROVIDER_ID_BY_KIND[connection.kind];
  const baseUrl = connection.kind === 'custom'
    ? validateCustomBaseUrl(connection.baseUrl || '')
    : DEFAULT_BASE_URLS[connection.kind as keyof typeof DEFAULT_BASE_URLS];

  return {
    id: option.id,
    name: option.name || option.id,
    api: API_BY_KIND[connection.kind],
    provider,
    baseUrl,
    reasoning: option.reasoning ?? false,
    thinkingLevelMap: thinkingLevelMapFromOption(option),
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: option.contextWindow ?? 128_000,
    maxTokens: option.maxTokens ?? 16_384,
  };
};

const modelsEndpoint = (baseUrl: string) => `${normalizeBaseUrl(baseUrl)}/models`;

const fetchJson = async (
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal });
  } catch {
    if (signal?.aborted) throw new DOMException('Model lookup was cancelled.', 'AbortError');
    // Provider URLs can contain credentials (Gemini uses a query parameter), so
    // never forward fetch diagnostics or upstream response bodies to the renderer.
    throw new Error('Could not reach the provider model endpoint.');
  }
  if (!response.ok) {
    throw new Error(`Provider model lookup failed (${response.status}).`);
  }
  const body = await response.json() as unknown;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Provider returned an invalid model catalog.');
  }
  return body as Record<string, unknown>;
};

const asModelRows = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => (
        typeof item === 'object' && item !== null && !Array.isArray(item)
      ))
    : []
);

const DEFAULT_REASONING_LEVELS: AIThinkingLevel[] = ['minimal', 'low', 'medium', 'high'];

const openRouterReasoning = (
  value: unknown,
): Pick<UnknownModelInput, 'reasoning' | 'thinkingLevels'> => {
  if (value !== true && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return {};
  }
  const metadata = value === true ? {} : value as Record<string, unknown>;
  const mandatory = metadata.mandatory === true;
  const rawEfforts = Array.isArray(metadata.supported_efforts)
    ? metadata.supported_efforts
    : [];
  const advertised = rawEfforts
    .map((effort) => effort === 'none' ? 'off' : effort)
    .filter(isAIThinkingLevel);
  const supported = new Set<AIThinkingLevel>(
    advertised.length > 0 ? advertised : DEFAULT_REASONING_LEVELS,
  );
  if (mandatory) supported.delete('off');
  else supported.add('off');
  return {
    reasoning: true,
    thinkingLevels: AI_THINKING_LEVELS.filter((level) => supported.has(level)),
  };
};

const normalizeUnknownModels = (
  rows: UnknownModelInput[],
  catalog: readonly Model<Api>[],
): AIModelOption[] => {
  const byId = new Map(catalog.map((model) => [model.id, model]));
  return [...new Map(rows.filter((row) => row.id).map((row) => {
    const known = byId.get(row.id);
    return [row.id, known
      ? {
          ...optionFromCatalogModel(known, 'live'),
          ...(row.reasoning === undefined ? {} : {
            reasoning: row.reasoning,
            thinkingLevels: row.thinkingLevels,
          }),
        }
      : {
          id: row.id,
          name: row.name || row.id,
          source: 'live' as const,
          contextWindow: row.contextWindow,
          maxTokens: row.maxTokens,
          reasoning: row.reasoning,
          thinkingLevels: row.thinkingLevels,
        }];
  })).values()].sort((left, right) => left.name.localeCompare(right.name));
};

export const queryModels = async (
  connection: AIConnectionPublic,
  secret: ConnectionSecret,
  signal?: AbortSignal,
): Promise<AIModelOption[]> => {
  if (connection.kind === 'openai-codex') {
    return providerForKind('openai-codex').getModels()
      .map((model) => optionFromCatalogModel(model, 'pi-catalog'));
  }
  const apiKey = secret.apiKey;
  if (!apiKey) throw new Error('This connection has no API key.');

  const catalog = connection.kind === 'custom' ? [] : providerForKind(connection.kind).getModels();
  if (connection.kind === 'google') {
    const body = await fetchJson(
      `${modelsEndpoint(DEFAULT_BASE_URLS.google)}?key=${encodeURIComponent(apiKey)}`,
      {},
      signal,
    );
    const rows = asModelRows(body.models)
      .filter((row) => (
        !Array.isArray(row.supportedGenerationMethods) ||
        row.supportedGenerationMethods.includes('generateContent')
      ))
      .map((row) => ({
        id: String(row.name || '').replace(/^models\//, ''),
        name: typeof row.displayName === 'string' ? row.displayName : undefined,
        contextWindow: typeof row.inputTokenLimit === 'number' ? row.inputTokenLimit : undefined,
        maxTokens: typeof row.outputTokenLimit === 'number' ? row.outputTokenLimit : undefined,
      }));
    return normalizeUnknownModels(rows, catalog);
  }

  const baseUrl = connection.kind === 'custom'
    ? validateCustomBaseUrl(connection.baseUrl || '')
    : DEFAULT_BASE_URLS[connection.kind];
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(secret.headers ?? {}),
  };
  if (connection.kind === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const endpoint = connection.kind === 'anthropic'
    ? `${modelsEndpoint(baseUrl)}?limit=1000`
    : modelsEndpoint(baseUrl);
  const body = await fetchJson(endpoint, headers, signal);
  const rows = asModelRows(body.data).map((row) => ({
    id: String(row.id || ''),
    name: typeof row.display_name === 'string'
      ? row.display_name
      : typeof row.name === 'string' ? row.name : undefined,
    contextWindow: typeof row.context_length === 'number' ? row.context_length : undefined,
    maxTokens: (
      typeof row.top_provider === 'object' &&
      row.top_provider !== null &&
      typeof (row.top_provider as Record<string, unknown>).max_completion_tokens === 'number'
    )
      ? (row.top_provider as Record<string, number>).max_completion_tokens
      : undefined,
    ...(connection.kind === 'openrouter' ? openRouterReasoning(row.reasoning) : {}),
  }));
  return normalizeUnknownModels(rows, catalog);
};

export class ConnectionCredentialStore implements CredentialStore {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly connectionId: string;
  private readonly providerId: string;
  private readonly store: AIConnectionStore;

  constructor(
    connectionId: string,
    providerId: string,
    store: AIConnectionStore,
  ) {
    this.connectionId = connectionId;
    this.providerId = providerId;
    this.store = store;
  }

  private current(): Credential | undefined {
    const secret = this.store.getSecret(this.connectionId);
    return secret?.credential ?? (secret?.apiKey
      ? { type: 'api_key', key: secret.apiKey }
      : undefined);
  }

  async read(providerId: string) {
    return providerId === this.providerId ? this.current() : undefined;
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const credential = this.current();
    return credential ? [{ providerId: this.providerId, type: credential.type }] : [];
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    if (providerId !== this.providerId) return Promise.resolve(undefined);
    const next = this.chain.then(async () => {
      const current = this.current();
      const updated = await fn(current);
      if (updated && updated.type === 'oauth') {
        await this.store.updateOAuthCredential(this.connectionId, updated);
      }
      return updated ?? current;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  async delete(providerId: string) {
    if (providerId === this.providerId) await this.store.deleteConnection(this.connectionId);
  }
}

export type ProviderRuntime = {
  models: Models;
  model: Model<Api>;
};

export const createProviderRuntime = (
  connection: AIConnectionPublic,
  modelOption: AIModelOption,
  store: AIConnectionStore,
): ProviderRuntime => {
  const providerId = connection.kind === 'custom'
    ? `custom-${connection.id}`
    : PROVIDER_ID_BY_KIND[connection.kind];
  const credentialStore = new ConnectionCredentialStore(connection.id, providerId, store);
  const models = createModels({ credentials: credentialStore });

  if (connection.kind === 'custom') {
    const model = createRuntimeModel(connection, modelOption, []);
    const customHeaders = store.getSecret(connection.id)?.headers;
    const provider = createProvider({
      id: providerId,
      name: connection.name,
      baseUrl: validateCustomBaseUrl(connection.baseUrl || ''),
      auth: {
        apiKey: {
          name: `${connection.name} API key`,
          resolve: async ({ credential }) => (
            credential?.key
              ? { auth: { apiKey: credential.key, headers: customHeaders } }
              : undefined
          ),
        },
      },
      models: [model],
      headers: customHeaders,
      api: openAICompletionsApi(),
    });
    models.setProvider(provider);
    return { models, model };
  }

  const provider = providerForKind(connection.kind);
  models.setProvider(provider);
  const model = createRuntimeModel(connection, modelOption, provider.getModels());
  return { models, model };
};

export const getCodexProvider = () => openaiCodexProvider();
