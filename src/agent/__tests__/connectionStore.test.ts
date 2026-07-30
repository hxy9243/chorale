// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AIConnectionStore,
  type SecretCipher,
} from '../../../electron/ai/connectionStore';

const directories: string[] = [];

const makeDirectory = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-ai-store-'));
  directories.push(directory);
  return directory;
};

const encryptedCipher: SecretCipher = {
  isAvailable: async () => true,
  encrypt: async (value) => Buffer.from(`encrypted:${value}`).toString('base64'),
  decrypt: async (value) => ({
    value: Buffer.from(value, 'base64').toString().replace(/^encrypted:/, ''),
    shouldReEncrypt: false,
  }),
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('AIConnectionStore', () => {
  it('persists secrets only as encrypted payloads and redacts public connections', async () => {
    const directory = await makeDirectory();
    const store = new AIConnectionStore(directory, encryptedCipher);
    await store.initialize();

    const connection = await store.saveConnection({
      name: 'Personal OpenAI',
      kind: 'openai',
      apiKey: 'sk-secret-value',
    });
    await store.updateModels(connection.id, [{
      id: 'gpt-test',
      name: 'GPT Test',
      source: 'live',
    }]);
    await store.setSelection({ connectionId: connection.id, modelId: 'gpt-test' });

    expect(connection).not.toHaveProperty('apiKey');
    expect(connection.persistence).toBe('encrypted');
    const serialized = await readFile(path.join(directory, 'ai-connections.v1.json'), 'utf8');
    expect(serialized).not.toContain('sk-secret-value');
    expect(serialized).toContain('encryptedSecret');

    const reloaded = new AIConnectionStore(directory, encryptedCipher);
    await reloaded.initialize();
    expect(reloaded.getSecret(connection.id)?.apiKey).toBe('sk-secret-value');
    expect(reloaded.getSelection()).toEqual({
      connectionId: connection.id,
      modelId: 'gpt-test',
    });
  });

  it('keeps credentials in memory when encryption is unavailable', async () => {
    const directory = await makeDirectory();
    const cipher: SecretCipher = {
      isAvailable: async () => false,
      encrypt: async () => {
        throw new Error('must not encrypt');
      },
      decrypt: async () => {
        throw new Error('must not decrypt');
      },
    };
    const store = new AIConnectionStore(directory, cipher);
    await store.initialize();
    const connection = await store.saveConnection({
      name: 'Session OpenRouter',
      kind: 'openrouter',
      apiKey: 'session-secret',
    });

    expect(connection.persistence).toBe('session-only');
    expect(store.getSecret(connection.id)?.apiKey).toBe('session-secret');
    const serialized = await readFile(path.join(directory, 'ai-connections.v1.json'), 'utf8');
    expect(serialized).not.toContain('session-secret');
    expect(serialized).not.toContain('encryptedSecret');
  });

  it('clears the global selection when its connection is deleted', async () => {
    const store = new AIConnectionStore(await makeDirectory(), encryptedCipher);
    await store.initialize();
    const connection = await store.saveConnection({
      name: 'Claude',
      kind: 'anthropic',
      apiKey: 'test-key',
    });
    await store.updateModels(connection.id, [{ id: 'claude-test', name: 'Claude', source: 'live' }]);
    await store.setSelection({ connectionId: connection.id, modelId: 'claude-test' });

    await store.deleteConnection(connection.id);

    expect(store.getSelection()).toBeNull();
    expect(store.listConnections()).toEqual([]);
  });
});
