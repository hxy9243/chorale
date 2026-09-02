// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIConnectionPublic, AIProviderKind } from '../aiTypes';
import {
  queryModels,
  validateCustomBaseUrl,
  validateCustomHeaders,
} from '../../../electron/ai/providers';

const connection = (kind: AIProviderKind, baseUrl?: string): AIConnectionPublic => ({
  id: `${kind}-connection`,
  name: kind,
  kind,
  baseUrl,
  authType: kind === 'openai-codex' ? 'oauth' : 'api-key',
  persistence: 'encrypted',
  status: 'ready',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider model discovery', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/models', 'authorization'],
    ['openrouter', 'https://openrouter.ai/api/v1/models', 'authorization'],
    ['anthropic', 'https://api.anthropic.com/v1/models?limit=1000', 'x-api-key'],
  ] as const)('queries the %s model endpoint with provider authentication', async (
    kind,
    expectedUrl,
    expectedHeader,
  ) => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.has(expectedHeader)).toBe(true);
      return new Response(JSON.stringify({
        data: [{ id: `${kind}-live-model`, display_name: 'Live model' }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const models = await queryModels(connection(kind), { apiKey: 'provider-secret' });

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(models).toEqual([expect.objectContaining({
      id: `${kind}-live-model`,
      name: 'Live model',
      source: 'live',
    })]);
  });

  it('queries Gemini and filters models that cannot generate content', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      models: [
        {
          name: 'models/gemini-test',
          displayName: 'Gemini Test',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/embedding-test',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const models = await queryModels(connection('google'), { apiKey: 'gemini-secret' });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1beta/models?key=gemini-secret');
    expect(models.map((model) => model.id)).toEqual(['gemini-test']);
  });

  it('preserves live OpenRouter reasoning capabilities and mandatory reasoning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{
        id: 'vendor/optional-reasoning-model',
        name: 'Optional reasoning model',
        reasoning: {
          mandatory: false,
          supported_efforts: ['low', 'high'],
        },
      }, {
        id: 'vendor/mandatory-reasoning-model',
        name: 'Mandatory reasoning model',
        reasoning: {
          mandatory: true,
          supported_efforts: ['low', 'high', 'max'],
        },
      }],
    }), { status: 200 })));

    const models = await queryModels(connection('openrouter'), { apiKey: 'provider-secret' });

    expect(models).toEqual([{
      id: 'vendor/mandatory-reasoning-model',
      name: 'Mandatory reasoning model',
      source: 'live',
      contextWindow: undefined,
      maxTokens: undefined,
      reasoning: true,
      thinkingLevels: ['low', 'high', 'max'],
    }, {
      id: 'vendor/optional-reasoning-model',
      name: 'Optional reasoning model',
      source: 'live',
      contextWindow: undefined,
      maxTokens: undefined,
      reasoning: true,
      thinkingLevels: ['off', 'low', 'high'],
    }]);
  });

  it('uses a custom OpenAI-compatible endpoint and validated headers', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('X-Workspace')).toBe('chorale');
      return new Response(JSON.stringify({ data: [{ id: 'local-model' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const models = await queryModels(
      connection('custom', 'http://127.0.0.1:11434/v1'),
      { apiKey: 'local-secret', headers: { 'X-Workspace': 'chorale' } },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/models',
      expect.any(Object),
    );
    expect(models[0].id).toBe('local-model');
  });

  it('does not expose an upstream response body containing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'Rejected credential provider-secret',
      { status: 401 },
    )));

    await expect(queryModels(connection('openai'), { apiKey: 'provider-secret' }))
      .rejects.toThrow('Provider model lookup failed (401).');
    await expect(queryModels(connection('openai'), { apiKey: 'provider-secret' }))
      .rejects.not.toThrow('provider-secret');
  });
});

describe('custom provider validation', () => {
  it('allows HTTPS and loopback HTTP while rejecting unsafe URLs', () => {
    expect(validateCustomBaseUrl('https://models.example/v1/')).toBe('https://models.example/v1');
    expect(validateCustomBaseUrl('http://localhost:8080/v1')).toBe('http://localhost:8080/v1');
    expect(() => validateCustomBaseUrl('http://models.example/v1')).toThrow('HTTPS');
    expect(() => validateCustomBaseUrl('file:///tmp/provider')).toThrow('HTTPS');
    expect(() => validateCustomBaseUrl('https://user:pass@models.example/v1')).toThrow('credentials');
  });

  it('rejects provider-managed and transport headers', () => {
    expect(validateCustomHeaders({ 'X-Workspace': 'chorale' })).toEqual({
      'X-Workspace': 'chorale',
    });
    expect(() => validateCustomHeaders({ Authorization: 'secret' })).toThrow('managed');
    expect(() => validateCustomHeaders({ Host: 'example.test' })).toThrow('managed');
    expect(() => validateCustomHeaders({ 'X-Test': 'bad\nvalue' })).toThrow('newline');
  });
});
