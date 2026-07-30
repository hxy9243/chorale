// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIConnectionStore, type SecretCipher } from '../../../electron/ai/connectionStore';
import { AIController } from '../../../electron/ai/controller';
import type { CodexOAuthAdapter } from '../../../electron/ai/codexOAuth';

const directories: string[] = [];
const cipher: SecretCipher = {
  isAvailable: async () => true,
  encrypt: async (value) => Buffer.from(value).toString('base64'),
  decrypt: async (value) => ({
    value: Buffer.from(value, 'base64').toString(),
    shouldReEncrypt: false,
  }),
};
const unusedOAuth: CodexOAuthAdapter = {
  login: async () => {
    throw new Error('not used');
  },
  openVerificationUrl: async () => undefined,
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('AIController model cache behavior', () => {
  it('retains the last successful model list when refresh later fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-controller-'));
    directories.push(directory);
    const store = new AIConnectionStore(directory, cipher);
    await store.initialize();
    const saved = await store.saveConnection({
      name: 'Custom',
      kind: 'custom',
      baseUrl: 'http://127.0.0.1:9876/v1',
      apiKey: 'test-secret',
    });
    const cached = [{ id: 'cached-model', name: 'Cached model', source: 'live' as const }];
    await store.updateModels(saved.id, cached);
    const controller = new AIController(store, unusedOAuth);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })));

    await expect(controller.refreshModels(saved.id)).rejects.toThrow('401');

    expect(controller.getCachedModels(saved.id)).toEqual(cached);
    expect(controller.listConnections()[0].status).toBe('invalid');
    expect(controller.listConnections()[0].modelsUpdatedAt).toBeTruthy();
  });

  it('does not replace a working credential when candidate validation fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-controller-'));
    directories.push(directory);
    const store = new AIConnectionStore(directory, cipher);
    await store.initialize();
    const saved = await store.saveConnection({
      name: 'Custom',
      kind: 'custom',
      baseUrl: 'http://127.0.0.1:9876/v1',
      apiKey: 'working-secret',
    });
    const cached = [{ id: 'cached-model', name: 'Cached model', source: 'live' as const }];
    await store.updateModels(saved.id, cached);
    const controller = new AIController(store, unusedOAuth);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })));

    await expect(controller.saveConnection({
      id: saved.id,
      name: 'Custom',
      kind: 'custom',
      baseUrl: 'http://127.0.0.1:9876/v1',
      apiKey: 'invalid-secret',
    })).rejects.toThrow('401');

    expect(store.getSecret(saved.id)?.apiKey).toBe('working-secret');
    expect(controller.getCachedModels(saved.id)).toEqual(cached);
    expect(controller.listConnections()[0].status).toBe('ready');
  });

  it('commits a candidate credential and its models after validation succeeds', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-controller-'));
    directories.push(directory);
    const store = new AIConnectionStore(directory, cipher);
    await store.initialize();
    const controller = new AIController(store, unusedOAuth);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      data: [{ id: 'validated-model', name: 'Validated model' }],
    })));

    const saved = await controller.saveConnection({
      name: 'Custom',
      kind: 'custom',
      baseUrl: 'http://127.0.0.1:9876/v1',
      apiKey: 'validated-secret',
    });

    expect(store.getSecret(saved.id)?.apiKey).toBe('validated-secret');
    expect(controller.getCachedModels(saved.id)).toEqual([{
      id: 'validated-model',
      name: 'Validated model',
      source: 'live',
    }]);
    expect(saved.status).toBe('ready');
    expect(saved.modelsUpdatedAt).toBeTruthy();
  });
});
