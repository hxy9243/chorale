// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIConnectionStore, type SecretCipher } from '../../../electron/ai/connectionStore';
import { AIController } from '../../../electron/ai/controller';
import type { CodexOAuthAdapter } from '../../../electron/ai/codexOAuth';
import { ConnectionCredentialStore } from '../../../electron/ai/providers';
import type { AIEvent } from '../aiTypes';

const directories: string[] = [];
const cipher: SecretCipher = {
  isAvailable: async () => true,
  encrypt: async (value) => Buffer.from(`encrypted:${value}`).toString('base64'),
  decrypt: async (value) => ({
    value: Buffer.from(value, 'base64').toString().replace(/^encrypted:/, ''),
    shouldReEncrypt: false,
  }),
};

const createStore = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-codex-oauth-'));
  directories.push(directory);
  const store = new AIConnectionStore(directory, cipher);
  await store.initialize();
  return { store, directory };
};

const waitForEvent = async (
  events: AIEvent[],
  predicate: (event: AIEvent) => boolean,
) => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const event = events.find(predicate);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for OAuth event.');
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('OpenAI Codex OAuth controller', () => {
  it('relays device progress and persists encrypted tokens without returning them', async () => {
    const { store, directory } = await createStore();
    const adapter: CodexOAuthAdapter = {
      openVerificationUrl: vi.fn(async () => undefined),
      login: vi.fn(async (_signal, notify) => {
        notify({
          verificationUri: 'https://auth.openai.com/codex/device',
          userCode: 'CODE-1234',
          expiresInSeconds: 600,
        });
        notify({ message: 'Waiting for approval' });
        return {
          credential: {
            type: 'oauth' as const,
            access: 'oauth-access-secret',
            refresh: 'oauth-refresh-secret',
            expires: Date.now() + 3_600_000,
          },
          models: [{
            id: 'codex-test',
            name: 'Codex Test',
            source: 'pi-catalog' as const,
          }],
        };
      }),
    };
    const controller = new AIController(store, adapter);
    const events: AIEvent[] = [];

    const { flowId } = controller.startCodexLogin((event) => events.push(event));
    const complete = await waitForEvent(
      events,
      (event) => event.type === 'oauth-update' && event.status === 'complete',
    );

    expect(flowId).toBeTruthy();
    expect(adapter.openVerificationUrl).toHaveBeenCalledWith(
      'https://auth.openai.com/codex/device',
    );
    expect(events).toContainEqual(expect.objectContaining({
      type: 'oauth-update',
      flowId,
      status: 'pending',
      details: expect.objectContaining({ userCode: 'CODE-1234' }),
    }));
    expect(JSON.stringify(complete)).not.toContain('oauth-access-secret');
    expect(JSON.stringify(complete)).not.toContain('oauth-refresh-secret');
    const connection = store.listConnections()[0];
    expect(connection.kind).toBe('openai-codex');
    expect(store.getSecret(connection.id)?.credential).toEqual(expect.objectContaining({
      type: 'oauth',
      access: 'oauth-access-secret',
    }));
    const serialized = await readFile(path.join(directory, 'ai-connections.v1.json'), 'utf8');
    expect(serialized).not.toContain('oauth-access-secret');
    expect(serialized).not.toContain('oauth-refresh-secret');
  });

  it('cancels an active device flow and rejects unknown flow IDs', async () => {
    const { store } = await createStore();
    const adapter: CodexOAuthAdapter = {
      openVerificationUrl: vi.fn(async () => undefined),
      login: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Cancelled', 'AbortError'));
        }, { once: true });
      }),
    };
    const controller = new AIController(store, adapter);
    const events: AIEvent[] = [];
    const { flowId } = controller.startCodexLogin((event) => events.push(event));

    controller.cancelCodexLogin(flowId);
    await waitForEvent(
      events,
      (event) => event.type === 'oauth-update' && event.status === 'cancelled',
    );

    expect(() => controller.cancelCodexLogin(flowId)).toThrow('not found');
    expect(store.listConnections()).toEqual([]);
    expect(() => controller.abortChat('missing-request')).toThrow('not found');
  });

  it('serializes concurrent OAuth refresh writes', async () => {
    const { store } = await createStore();
    const connection = await store.saveOAuthConnection({
      type: 'oauth',
      access: 'initial-access',
      refresh: 'initial-refresh',
      expires: 1,
    }, [{ id: 'codex-test', name: 'Codex Test', source: 'pi-catalog' }]);
    const credentials = new ConnectionCredentialStore(
      connection.id,
      'openai-codex',
      store,
    );
    let activeRefreshes = 0;
    let maximumConcurrentRefreshes = 0;

    const first = credentials.modify('openai-codex', async (current) => {
      activeRefreshes += 1;
      maximumConcurrentRefreshes = Math.max(maximumConcurrentRefreshes, activeRefreshes);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRefreshes -= 1;
      return current?.type === 'oauth'
        ? { ...current, access: 'first-refresh', expires: 2 }
        : undefined;
    });
    const second = credentials.modify('openai-codex', async (current) => {
      activeRefreshes += 1;
      maximumConcurrentRefreshes = Math.max(maximumConcurrentRefreshes, activeRefreshes);
      expect(current).toEqual(expect.objectContaining({ access: 'first-refresh' }));
      activeRefreshes -= 1;
      return current?.type === 'oauth'
        ? { ...current, access: 'second-refresh', expires: 3 }
        : undefined;
    });

    await Promise.all([first, second]);

    expect(maximumConcurrentRefreshes).toBe(1);
    expect(store.getSecret(connection.id)?.credential).toEqual(expect.objectContaining({
      access: 'second-refresh',
      expires: 3,
    }));
  });
});
