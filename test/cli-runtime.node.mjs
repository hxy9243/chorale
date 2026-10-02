import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
} from '../server/runtime.mjs';
import {
  HELP_TEXT,
  ensureDaemon,
  pullLatestRelease,
  resolvePackageRoot,
  runCli,
  runDaemon,
  stopDaemon,
} from '../server/cli.mjs';
import { CHORALE_VERSION } from '../server/version.mjs';

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

test('runCli prints help text for "help", "--help", and "-h"', async () => {
  for (const flag of ['help', '--help', '-h']) {
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), error: () => {} };
    const result = await runCli({ args: [flag], logger });

    assert.equal(result.statusCode, 0);
    assert.equal(result.help, true);
    assert.equal(result.text, HELP_TEXT);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Usage:\s+chorale \[command\]/);
    assert.match(logs[0], /start\s+Start the Chorale background daemon/);
    assert.match(logs[0], /help\s+Display this help message/);
  }
});

test('runCli prints version for "version", "--version", and "-v"', async () => {
  for (const flag of ['version', '--version', '-v']) {
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), error: () => {} };
    const result = await runCli({ args: [flag], logger });

    assert.equal(result.statusCode, 0);
    assert.equal(result.version, CHORALE_VERSION);
    assert.equal(logs.length, 1);
    assert.equal(logs[0], `chorale v${CHORALE_VERSION}`);
  }
});

test('runCli setup music21 installs the managed analyzer without starting the daemon', async () => {
  const logs = [];
  const result = await runCli({
    args: ['setup', 'music21'],
    choraleHome: '/tmp/chorale-test-home',
    logger: { log: (message) => logs.push(message), error: () => {} },
    installMusic21: async ({ choraleHome }) => {
      assert.equal(choraleHome, '/tmp/chorale-test-home');
      return { version: '9.9.1', pythonVersion: '3.12.3', source: 'managed' };
    },
    ensureDaemon: () => assert.fail('setup must not start the daemon'),
  });

  assert.equal(result.statusCode, 0);
  assert.equal(result.installed.version, '9.9.1');
  assert.match(logs[0], /Installing the pinned music21 analyzer/);
  assert.match(logs[1], /music21 9.9.1 is ready with Python 3.12.3/);
});

test('runCli logs error and returns status code 1 on unknown command', async () => {
  const errors = [];
  const logs = [];
  const logger = { log: (msg) => logs.push(msg), error: (msg) => errors.push(msg) };
  const result = await runCli({ args: ['nonexistent'], logger });

  assert.equal(result.statusCode, 1);
  assert.match(result.error, /Unknown command: nonexistent/);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Unknown command: nonexistent/);
  assert.match(errors[0], /Usage:\s+chorale/);
  assert.equal(logs.length, 0);
});

test('runCli defaults to "start" when no command is provided or when "start" is explicit', async () => {
  for (const args of [[], ['start']]) {
    let ensured = false;
    let openedUrl = null;
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), error: () => {} };
    const result = await runCli({
      args,
      logger,
      ensureDaemon: async () => {
        ensured = true;
        return { health: { port: 1685 }, started: true };
      },
      openBrowser: async (url) => {
        openedUrl = url;
      },
    });

    assert.equal(ensured, true);
    assert.equal(openedUrl, 'http://127.0.0.1:1685');
    assert.equal(result.started, true);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Chorale service started on http:\/\/127.0.0.1:1685/);
  }
});

test('stopDaemon stops a verified legacy chorale daemon when runtime.json is absent by resolving the listening PID', async () => {
  const signals = [];
  const aliveChecks = [true, false];
  const probes = [
    { service: 'chorale-service' },
    null,
  ];
  const result = await stopDaemon({
    port: 1985,
    readRuntime: async () => null,
    probe: async () => probes.shift() ?? null,
    resolveListeningPid: async () => 9876,
    kill: (...args) => signals.push(args),
    isProcessAlive: () => aliveChecks.shift() ?? false,
  });

  assert.equal(result.stopped, true);
  assert.deepEqual(signals, [[9876, 'SIGTERM']]);
});

test('stopDaemon stops a verified daemon using health.pid when runtime.json is missing', async () => {
  const signals = [];
  const aliveChecks = [true, false];
  const probes = [
    { service: 'chorale-service', pid: 5432 },
    null,
  ];
  const result = await stopDaemon({
    port: 1985,
    readRuntime: async () => null,
    probe: async () => probes.shift() ?? null,
    kill: (...args) => signals.push(args),
    isProcessAlive: () => aliveChecks.shift() ?? false,
  });

  assert.equal(result.stopped, true);
  assert.deepEqual(signals, [[5432, 'SIGTERM']]);
});

test('stopDaemon cleans up runtime.json upon stopping matching runtime', async () => {
  const choraleHome = await mkdtemp(join(tmpdir(), 'chorale-stop-'));
  try {
    await writeRuntime({ pid: 1234, port: 1985, version: '1.0.0' }, choraleHome);
    const probes = [{ service: 'chorale-service', pid: 1234 }, null];
    const aliveChecks = [true, false];
    const result = await stopDaemon({
      port: 1985,
      choraleHome,
      probe: async () => probes.shift() ?? null,
      kill: () => {},
      isProcessAlive: () => aliveChecks.shift() ?? false,
    });
    assert.equal(result.stopped, true);
    assert.equal(await readRuntime(choraleHome), null);
  } finally {
    await rm(choraleHome, { recursive: true, force: true });
  }
});

test('resolvePackageRoot resolves package root from entrypoint or fallback', async () => {
  assert.equal(resolvePackageRoot('/custom/dir/bin/chorale.mjs'), '/custom/dir');
  const packageJson = JSON.parse(await readFile(join(resolvePackageRoot(), 'package.json'), 'utf8'));
  assert.equal(packageJson.name, 'chorale');
});

test('resolvePackageRoot resolves package root following symlinks', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-symlink-'));
  try {
    const pkgDir = join(tempDir, 'pkg');
    const binDir = join(pkgDir, 'bin');
    await mkdir(binDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const targetScript = join(binDir, 'cli.mjs');
    await writeFile(targetScript, '#!/usr/bin/env node');

    const linkDir = join(tempDir, 'global-bin');
    await mkdir(linkDir, { recursive: true });
    const symlinkPath = join(linkDir, 'chorale');
    await symlink(targetScript, symlinkPath);

    assert.equal(resolvePackageRoot(symlinkPath), pkgDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('pullLatestRelease pulls git commits and builds workspace assets in a git repository', async () => {
  const commands = [];
  const logs = [];
  const logger = { log: (msg) => logs.push(msg), error: () => {} };
  const result = await pullLatestRelease({
    packageRoot: '/test/repo',
    isGit: true,
    logger,
    execCommand: async (cmd, args, opts) => {
      commands.push({ cmd, args, opts });
      if (cmd === 'git') return { stdout: 'Updating abc123..def456\nFast-forward\n' };
      if (cmd === 'npm') return { stdout: 'dist/index.html 0.90 kB\nbuilt in 1.2s' };
      return { stdout: '' };
    },
  });

  assert.equal(result.updated, true);
  assert.equal(result.strategy, 'git');
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], { cmd: 'git', args: ['pull'], opts: { cwd: '/test/repo' } });
  assert.deepEqual(commands[1], { cmd: 'npm', args: ['run', 'build'], opts: { cwd: '/test/repo' } });
  assert.ok(logs.some((l) => l.includes('Pulling latest release from git')));
  assert.ok(logs.some((l) => l.includes('Building workspace assets')));
});

test('pullLatestRelease updates package via npm when not in a git repo and package is public', async () => {
  const commands = [];
  const logs = [];
  const logger = { log: (msg) => logs.push(msg), error: () => {} };
  const result = await pullLatestRelease({
    packageRoot: '/test/npm-pkg',
    isGit: false,
    packageName: '@chorale/cli',
    logger,
    execCommand: async (cmd, args, opts) => {
      commands.push({ cmd, args, opts });
      return { stdout: '' };
    },
  });

  assert.equal(result.updated, true);
  assert.equal(result.strategy, 'npm');
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args, ['install', '-g', '@chorale/cli@latest']);
  assert.ok(logs.some((l) => l.includes('Updating @chorale/cli via npm')));
});

test('pullLatestRelease skips pulling when not in git and no public package name', async () => {
  const commands = [];
  const logs = [];
  const logger = { log: (msg) => logs.push(msg), error: () => {} };
  const result = await pullLatestRelease({
    packageRoot: '/test/unknown',
    isGit: false,
    packageName: null,
    logger,
    execCommand: async (cmd, args, opts) => {
      commands.push({ cmd, args, opts });
      return { stdout: '' };
    },
  });

  assert.equal(result.updated, false);
  assert.equal(result.strategy, 'none');
  assert.equal(commands.length, 0);
  assert.ok(logs.some((l) => l.includes('skipping release pull')));
});

test('runCli upgrade pulls latest release and restarts running server', async () => {
  const calls = [];
  const logs = [];
  const logger = { log: (msg) => logs.push(msg), error: () => {} };
  const result = await runCli({
    args: ['upgrade'],
    logger,
    pullLatest: async () => {
      calls.push('pull');
      return { updated: true, strategy: 'git' };
    },
    stopDaemon: async () => {
      calls.push('stop');
      return { stopped: true };
    },
    ensureDaemon: async () => {
      calls.push('ensure');
      return { health: { version: '1.2.3', port: 1685 }, started: true };
    },
  });

  assert.deepEqual(calls, ['pull', 'stop', 'ensure']);
  assert.equal(result.stopped, true);
  assert.equal(result.health.version, '1.2.3');
  assert.ok(logs.some((l) => l.includes('Chorale service restarted at version 1.2.3.')));
});

test('runCli upgrade pulls latest release and starts server if daemon was not running', async () => {
  const calls = [];
  const logs = [];
  const logger = { log: (msg) => logs.push(msg), error: () => {} };
  const result = await runCli({
    args: ['upgrade'],
    logger,
    pullLatest: async () => {
      calls.push('pull');
      return { updated: true, strategy: 'git' };
    },
    stopDaemon: async () => {
      calls.push('stop');
      return { stopped: false };
    },
    ensureDaemon: async () => {
      calls.push('ensure');
      return { health: { version: '2.0.0', port: 1685 }, started: true };
    },
  });

  assert.deepEqual(calls, ['pull', 'stop', 'ensure']);
  assert.equal(result.stopped, false);
  assert.equal(result.health.version, '2.0.0');
  assert.ok(logs.some((l) => l.includes('Chorale service started at version 2.0.0.')));
});

test('runCli upgrade respects --skip-pull and --no-pull flags', async () => {
  for (const flag of ['--skip-pull', '--no-pull']) {
    const calls = [];
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), error: () => {} };
    const result = await runCli({
      args: ['upgrade', flag],
      logger,
      pullLatest: async () => {
        calls.push('pull');
      },
      stopDaemon: async () => {
        calls.push('stop');
        return { stopped: true };
      },
      ensureDaemon: async () => {
        calls.push('ensure');
        return { health: { version: '1.0.0' } };
      },
    });

    assert.deepEqual(calls, ['stop', 'ensure']);
    assert.equal(result.stopped, true);
  }
});

test('runCli upgrade aborts without stopping running server when pull fails', async () => {
  const calls = [];
  const errors = [];
  const logger = { log: () => {}, error: (msg) => errors.push(msg) };
  const result = await runCli({
    args: ['upgrade'],
    logger,
    pullLatest: async () => {
      calls.push('pull');
      throw new Error('Connection refused to git remote');
    },
    stopDaemon: async () => {
      calls.push('stop');
      return { stopped: true };
    },
    ensureDaemon: async () => {
      calls.push('ensure');
      return { health: { version: '1.0.0' } };
    },
  });

  assert.deepEqual(calls, ['pull']);
  assert.equal(result.statusCode, 1);
  assert.match(result.error, /Connection refused to git remote/);
  assert.ok(errors.some((e) => e.includes('Failed to pull latest release: Connection refused to git remote')));
});

