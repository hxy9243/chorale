import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  RuntimeLockError,
  acquireRuntimeLock,
  probeHealth,
  readRuntime,
  runtimePaths,
  writeRuntime,
} from '../mcp/runtime.mjs';
import { ensureDaemon, runDaemon, stopDaemon } from '../mcp/cli.mjs';

test('runtime records daemon metadata atomically', async () => {
  const choraleHome = await mkdtemp(join(tmpdir(), 'chorale-runtime-'));
  try {
    await writeRuntime({ pid: process.pid, port: 1685, version: '1.0.0' }, choraleHome);
    assert.deepEqual(await readRuntime(choraleHome), { pid: process.pid, port: 1685, version: '1.0.0' });
    assert.match(await readFile(runtimePaths(choraleHome).runtime, 'utf8'), /"port": 1685/);
  } finally {
    await rm(choraleHome, { recursive: true, force: true });
  }
});

test('runtime lock prevents a second live daemon and recovers a stale lock', async () => {
  const choraleHome = await mkdtemp(join(tmpdir(), 'chorale-runtime-'));
  try {
    const lock = await acquireRuntimeLock({ choraleHome });
    await assert.rejects(
      acquireRuntimeLock({ choraleHome }),
      RuntimeLockError,
    );
    await lock.release();

    await writeFile(runtimePaths(choraleHome).lock, JSON.stringify({ pid: 999_999_999 }), 'utf8');
    const recovered = await acquireRuntimeLock({ choraleHome });
    await recovered.release();
  } finally {
    await rm(choraleHome, { recursive: true, force: true });
  }
});

test('health probe accepts only the Chorale daemon identity', async () => {
  const healthy = await probeHealth({
    fetchImpl: async () => new Response(JSON.stringify({ service: 'chorale-service', status: 'ok' }), { status: 200 }),
  });
  assert.equal(healthy.service, 'chorale-service');

  const unrelated = await probeHealth({
    fetchImpl: async () => new Response(JSON.stringify({ service: 'other-service' }), { status: 200 }),
  });
  assert.equal(unrelated, null);
});

test('ensureDaemon launches once and waits for the shared daemon health response', async () => {
  const spawned = [];
  const result = await ensureDaemon({
    entrypoint: '/opt/chorale/bin/chorale.mjs',
    probe: async () => null,
    waitForHealthy: async () => ({ service: 'chorale-service', port: 1685 }),
    spawnImpl: (...args) => {
      spawned.push(args);
      return { unref() {} };
    },
  });

  assert.equal(result.started, true);
  assert.deepEqual(spawned[0].slice(0, 2), [process.execPath, ['/opt/chorale/bin/chorale.mjs', '--serve']]);
});

test('runDaemon records metadata and releases the runtime on graceful stop', async () => {
  const calls = [];
  const result = await runDaemon({
    port: 1985,
    probe: async () => null,
    acquireLock: async () => ({ release: async () => calls.push('release') }),
    startServer: async () => ({
      port: 1985,
      httpServer: { close: (done) => { calls.push('close'); done(); } },
    }),
    writeRuntime: async (metadata) => calls.push({ write: metadata }),
    removeRuntime: async () => calls.push('remove'),
  });

  assert.equal(calls[0].write.port, 1985);
  await result.stop();
  assert.deepEqual(calls.slice(1), ['close', 'remove', 'release']);
});

test('runDaemon treats a competing healthy daemon as a no-op after EADDRINUSE', async () => {
  let waitCalls = 0;
  const result = await runDaemon({
    port: 1985,
    probe: async () => null,
    acquireLock: async () => ({ release: async () => {} }),
    startServer: async () => {
      const error = new Error('Address already in use');
      error.code = 'EADDRINUSE';
      throw error;
    },
    waitForHealthy: async () => {
      waitCalls += 1;
      return { service: 'chorale-service', port: 1985 };
    },
  });

  assert.equal(result.alreadyRunning, true);
  assert.equal(waitCalls, 1);
});

test('stopDaemon terminates only the matching recorded Chorale process', async () => {
  const probes = [
    { service: 'chorale-service', pid: 1234 },
    null,
  ];
  const signals = [];
  const aliveChecks = [true, false];
  const result = await stopDaemon({
    port: 1985,
    readRuntime: async () => ({ pid: 1234, port: 1985 }),
    probe: async () => probes.shift() ?? null,
    kill: (...args) => signals.push(args),
    isProcessAlive: () => aliveChecks.shift() ?? false,
  });

  assert.equal(result.stopped, true);
  assert.deepEqual(signals, [[1234, 'SIGTERM']]);
});

test('stopDaemon never terminates a process without matching runtime metadata', async () => {
  await assert.rejects(
    stopDaemon({
      port: 1985,
      readRuntime: async () => ({ pid: 1234, port: 1985 }),
      probe: async () => ({ service: 'chorale-service', pid: 4567 }),
      kill: () => assert.fail('must not kill an unverified process'),
    }),
    /Refusing to stop/,
  );
});
