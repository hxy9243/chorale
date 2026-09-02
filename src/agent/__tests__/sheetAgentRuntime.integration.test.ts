// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import abcjs from 'abcjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIConnectionStore, type SecretCipher } from '../../../electron/ai/connectionStore';
import {
  mapAgentError,
  projectAssistantDelta,
  redactSecretValues,
  SheetAgentRun,
} from '../../../electron/ai/sheetAgentRuntime';
import type { AIEvent, AIModelOption, SheetAgentRequest } from '../aiTypes';
import { JSONLAgentTraceStore } from '../../../electron/ai/agentTrace';

const directories: string[] = [];
const servers: Server[] = [];

const cipher: SecretCipher = {
  isAvailable: async () => true,
  encrypt: async (value) => Buffer.from(value).toString('base64'),
  decrypt: async (value) => ({
    value: Buffer.from(value, 'base64').toString(),
    shouldReEncrypt: false,
  }),
};

const listen = async (server: Server) => {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
};

const createStore = async (baseUrl: string) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-agent-runtime-'));
  directories.push(directory);
  const store = new AIConnectionStore(directory, cipher);
  await store.initialize();
  const connection = await store.saveConnection({
    name: 'Local integration provider',
    kind: 'custom',
    baseUrl,
    apiKey: 'integration-secret',
    headers: { 'X-Chorale-Test': 'grounded' },
  });
  const model: AIModelOption = {
    id: 'chorale-test-model',
    name: 'Chorale Test Model',
    source: 'live',
    reasoning: true,
    maxTokens: 943_718,
  };
  await store.updateModels(connection.id, [model]);
  return { directory, store, connection: store.getConnection(connection.id)!, model };
};

const createOpenRouterStore = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-openrouter-runtime-'));
  directories.push(directory);
  const store = new AIConnectionStore(directory, cipher);
  await store.initialize();
  const connection = await store.saveConnection({
    name: 'OpenRouter integration provider',
    kind: 'openrouter',
    apiKey: 'integration-secret',
  });
  const model: AIModelOption = {
    id: 'vendor/mandatory-reasoning-model',
    name: 'Mandatory reasoning model',
    source: 'live',
    reasoning: true,
    thinkingLevels: ['low', 'high'],
    maxTokens: 943_718,
  };
  await store.updateModels(connection.id, [model]);
  return { store, connection: store.getConnection(connection.id)!, model };
};

const request: SheetAgentRequest = {
  question: 'How does this cadence resolve?',
  thinkingLevel: 'low',
  history: [{
    id: 'history-user',
    role: 'user',
    content: 'What key is this in?',
    createdAt: '2026-07-29T12:00:00.000Z',
    status: 'complete',
  }, {
    id: 'history-assistant',
    role: 'assistant',
    content: 'The score is in C major.',
    createdAt: '2026-07-29T12:00:01.000Z',
    status: 'complete',
  }],
  context: {
    id: 'context-current',
    documentId: 'document-current',
    revision: 17,
    capturedAt: '2026-07-29T12:01:00.000Z',
    fileName: 'Cadence study.abc',
    abc: 'X:1\nT:Cadence study\nK:C\nG,CEG|G,BDF|CEGc|',
    annotations: [],
  },
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('SheetAgentRun provider transport', () => {
  it('sends authenticated score context and history, then streams deltas', async () => {
    let receivedBody = '';
    let receivedAuthorization = '';
    let receivedCustomHeader = '';
    const server = createServer((incoming, response) => {
      receivedAuthorization = incoming.headers.authorization ?? '';
      receivedCustomHeader = String(incoming.headers['x-chorale-test'] ?? '');
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk) => {
        receivedBody += chunk;
      });
      incoming.on('end', () => {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        });
        response.write('data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chorale-test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"The dominant "},"finish_reason":null}]}\n\n');
        response.write('data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chorale-test-model","choices":[{"index":0,"delta":{"content":"resolves to tonic."},"finish_reason":null}]}\n\n');
        response.write('data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chorale-test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
        response.end('data: [DONE]\n\n');
      });
    });
    const port = await listen(server);
    const { directory, store, connection, model } = await createStore(`http://127.0.0.1:${port}/v1`);
    const events: AIEvent[] = [];
    const traceDirectory = path.join(directory, 'agent-traces');

    const parseOnly = vi.spyOn(abcjs, 'parseOnly');
    const run = new SheetAgentRun(
      'runtime-request',
      request,
      connection,
      model,
      store,
      (event) => events.push(event),
      new JSONLAgentTraceStore(traceDirectory),
    );
    expect(run.scoreSnapshot).toMatchObject({
      snapshotId: 'context-current',
      documentId: 'document-current',
      revision: 17,
    });
    await run.sheetTools.tools[0].execute('profile-route-test', { profiles: ['harmony'] });
    expect(events).toContainEqual({
      type: 'profile-route',
      requestId: 'runtime-request',
      profiles: ['harmony'],
    });
    await run.sheetTools.tools[4].execute('proposal-test', {
      annotations: [{
        kind: 'explanation',
        span: { startMeasure: 1, endMeasure: 2 },
        label: 'Cadence',
        body: 'The passage prepares and resolves the cadence.',
      }],
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'proposal-created',
      requestId: 'runtime-request',
      proposal: expect.objectContaining({
        runId: 'runtime-request',
        documentId: 'document-current',
        sourceRevision: 17,
        state: 'proposed',
      }),
    }));
    events.length = 0;
    await run.start();
    expect(parseOnly).toHaveBeenCalledTimes(1);

    expect(receivedAuthorization).toBe('Bearer integration-secret');
    expect(receivedCustomHeader).toBe('grounded');
    expect(receivedBody).toContain('Cadence study.abc');
    expect(receivedBody).toContain('G,CEG|G,BDF|CEGc|');
    expect(receivedBody).toContain('What key is this in?');
    expect(receivedBody).toContain('How does this cadence resolve?');
    expect(receivedBody).toContain('select_analysis_profile');
    expect(receivedBody).toContain('read_measure_range');
    expect(receivedBody).toContain('Before making any score-specific claim');
    expect(JSON.parse(receivedBody)).toMatchObject({ max_completion_tokens: 16_384 });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'chat-start',
      requestId: 'runtime-request',
      providerKind: 'custom',
    }));
    expect(events.filter((event) => event.type === 'chat-delta').map((event) => event.text).join(''))
      .toBe('The dominant resolves to tonic.');
    expect(events.at(-1)).toEqual({ type: 'chat-done', requestId: 'runtime-request' });

    const traceFiles = await readdir(traceDirectory);
    expect(traceFiles).toHaveLength(1);
    const traceText = await readFile(path.join(traceDirectory, traceFiles[0]), 'utf8');
    const traceRecords = traceText.trimEnd().split('\n').map((line) => JSON.parse(line));
    expect(traceRecords.map((record) => record.event)).toContain('run-start');
    expect(traceRecords.map((record) => record.event)).toContain('provider-request');
    expect(traceRecords.map((record) => record.event)).toContain('provider-response');
    expect(traceRecords.map((record) => record.event)).toContain('agent-event');
    expect(traceRecords.at(-1)).toMatchObject({
      event: 'run-end',
      data: {
        status: 'complete',
        selectedProfiles: ['harmony'],
      },
    });
    expect(traceText).toContain('Before making any score-specific claim');
    expect(traceText).toContain('How does this cadence resolve?');
    expect(traceRecords.find((record) => record.event === 'run-start')).toMatchObject({
      data: { thinkingLevel: 'low', requestedThinkingLevel: 'low' },
    });
    expect(traceText).toContain('The dominant resolves to tonic.');
    expect(traceText).not.toContain('integration-secret');
  });

  it('does not disable mandatory OpenRouter reasoning and caps the output budget', async () => {
    let receivedBody = '';
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      receivedBody = String(init?.body ?? '');
      return new Response([
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"vendor/mandatory-reasoning-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Done."},"finish_reason":null}]}',
        '',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"vendor/mandatory-reasoning-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }));
    const { store, connection, model } = await createOpenRouterStore();
    const run = new SheetAgentRun(
      'openrouter-request',
      { ...request, thinkingLevel: 'off' },
      connection,
      model,
      store,
      () => undefined,
    );

    await run.start();

    expect(JSON.parse(receivedBody)).toMatchObject({ max_completion_tokens: 16_384 });
    expect(JSON.parse(receivedBody)).not.toHaveProperty('reasoning');
  });

  it('aborts an in-flight upstream request', async () => {
    let requestArrived!: () => void;
    const arrived = new Promise<void>((resolve) => {
      requestArrived = resolve;
    });
    let markUpstreamClosed!: () => void;
    const upstreamClosed = new Promise<void>((resolve) => {
      markUpstreamClosed = resolve;
    });
    const server = createServer((incoming, response) => {
      incoming.on('aborted', () => {
        markUpstreamClosed();
      });
      response.on('close', () => {
        markUpstreamClosed();
      });
      requestArrived();
    });
    const port = await listen(server);
    const { store, connection, model } = await createStore(`http://127.0.0.1:${port}/v1`);
    const events: AIEvent[] = [];
    const run = new SheetAgentRun(
      'abort-request',
      request,
      connection,
      model,
      store,
      (event) => events.push(event),
    );

    const running = run.start();
    await arrived;
    run.abort();
    await running;
    const closed = await Promise.race([
      upstreamClosed.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);

    expect(closed).toBe(true);
    expect(events.at(-1)).toEqual(expect.objectContaining({
      type: 'chat-error',
      requestId: 'abort-request',
      code: 'aborted',
    }));
  });
});

describe('assistant stream projection', () => {
  it('wraps completed provider thinking as a quoted chat trace', () => {
    expect(projectAssistantDelta({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'thinking_end',
        contentIndex: 0,
        content: 'Check the inner voices.',
        partial: {},
      },
      message: {},
    } as unknown as Parameters<typeof projectAssistantDelta>[0])).toBe(
      '<think>\nCheck the inner voices.\n</think>\n\n',
    );
  });
});

describe('provider error normalization', () => {
  it('maps authentication, rate-limit, network, model, and cancellation failures', () => {
    expect(mapAgentError(new Error('401 Unauthorized'))).toEqual(expect.objectContaining({ code: 'auth' }));
    expect(mapAgentError(new Error('429 rate limit'))).toEqual(expect.objectContaining({ code: 'rate_limit' }));
    expect(mapAgentError(new Error('fetch failed'))).toEqual(expect.objectContaining({ code: 'network' }));
    expect(mapAgentError(new Error('unknown model'))).toEqual(expect.objectContaining({ code: 'model' }));
    expect(mapAgentError(new DOMException('Stopped', 'AbortError'))).toEqual(expect.objectContaining({
      code: 'aborted',
    }));
  });

  it('redacts API keys, custom header values, and OAuth tokens from renderer errors', () => {
    const message = [
      'key=api-secret-value',
      'header=custom-secret-value',
      'access=oauth-access-token',
    ].join(' ');

    expect(redactSecretValues(message, {
      apiKey: 'api-secret-value',
      headers: { 'X-Secret': 'custom-secret-value' },
      credential: { type: 'oauth', access: 'oauth-access-token' },
    })).toBe('key=[redacted] header=[redacted] access=[redacted]');
  });
});
