import { spawn } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './index.mjs';
import { proxyDaemonTools } from './daemon-mutations.mjs';
import { startServer } from './server.mjs';
import {
  CHORALE_PORT,
  RuntimeLockError,
  acquireRuntimeLock,
  isProcessAlive,
  probeHealth,
  readRuntime,
  removeRuntime,
  waitForHealthyDaemon,
  writeRuntime,
} from './runtime.mjs';
import { LocalDocumentStore } from './store.mjs';
import { openBrowser } from './tools/workspace.mjs';
import { ViewSnapshotStore } from './views.mjs';
import { CHORALE_VERSION } from './version.mjs';

export const ensureDaemon = async (options = {}) => {
  const port = options.port || CHORALE_PORT;
  const probe = options.probe || probeHealth;
  const waitForHealthy = options.waitForHealthy || waitForHealthyDaemon;
  const spawnImpl = options.spawnImpl || spawn;
  const entrypoint = options.entrypoint;

  const existing = await probe({ port });
  if (existing) return { health: existing, started: false };
  if (!entrypoint) throw new Error('Chorale CLI cannot start its daemon without an entrypoint path.');

  const child = spawnImpl(process.execPath, [entrypoint, '--serve'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref?.();

  const health = await waitForHealthy({ port });
  if (!health) throw new Error(`Chorale did not become healthy on http://127.0.0.1:${port}.`);
  return { health, started: true };
};

export const runDaemon = async (options = {}) => {
  const port = options.port || CHORALE_PORT;
  const probe = options.probe || probeHealth;
  const waitForHealthy = options.waitForHealthy || waitForHealthyDaemon;
  const start = options.startServer || startServer;
  const acquireLock = options.acquireLock || acquireRuntimeLock;
  const write = options.writeRuntime || writeRuntime;
  const remove = options.removeRuntime || removeRuntime;
  const choraleHome = options.choraleHome;

  if (await probe({ port })) return { alreadyRunning: true };

  let lock;
  try {
    lock = await acquireLock({ choraleHome });
  } catch (error) {
    if (!(error instanceof RuntimeLockError)) throw error;
    const health = await waitForHealthy({ port });
    if (health) return { alreadyRunning: true, health };
    throw new Error('Chorale daemon startup is in progress but did not become healthy.');
  }

  try {
    if (await probe({ port })) {
      await lock.release();
      return { alreadyRunning: true };
    }

    const running = await start({ port, choraleHome });
    await write({
      pid: process.pid,
      executable: process.execPath,
      version: CHORALE_VERSION,
      port: running.port,
      startedAt: new Date().toISOString(),
    }, choraleHome);

    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await new Promise((resolveClose) => running.httpServer.close(resolveClose));
      await remove(choraleHome);
      await lock.release();
    };

    process.once('SIGTERM', () => { void stop().then(() => process.exit(0)); });
    process.once('SIGINT', () => { void stop().then(() => process.exit(0)); });
    return { ...running, stop };
  } catch (error) {
    await lock.release();
    if (error?.code === 'EADDRINUSE') {
      const health = await waitForHealthy({ port, attempts: 10, delayMs: 50 });
      if (health) return { alreadyRunning: true, health };
    }
    throw error;
  }
};

export const resolveListeningPid = async (port = CHORALE_PORT) => {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    try {
      const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
      const pid = Number(stdout.trim().split(/\s+/)[0]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      try {
        const { stdout } = await execFileAsync('fuser', [`${port}/tcp`]);
        const pid = Number(stdout.trim().split(/\s+/)[0]);
        if (Number.isInteger(pid) && pid > 0) return pid;
      } catch {
        if (process.platform === 'win32') {
          try {
            const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp']);
            for (const line of stdout.split('\n')) {
              if (line.includes(`:${port}`) && line.includes('LISTENING')) {
                const parts = line.trim().split(/\s+/);
                const pid = Number(parts[parts.length - 1]);
                if (Number.isInteger(pid) && pid > 0) return pid;
              }
            }
          } catch {}
        }
      }
    }
  } catch {}
  return null;
};

export const stopDaemon = async (options = {}) => {
  const port = options.port || CHORALE_PORT;
  const probe = options.probe || probeHealth;
  const read = options.readRuntime || readRuntime;
  const kill = options.kill || process.kill.bind(process);
  const isAlive = options.isProcessAlive || isProcessAlive;
  const resolvePid = options.resolveListeningPid || resolveListeningPid;
  const remove = options.removeRuntime || removeRuntime;
  const runtime = await read(options.choraleHome);
  const health = await probe({ port });

  if (!health) return { stopped: false };

  if (runtime?.pid && health.pid && runtime.pid !== health.pid) {
    throw new Error('Refusing to stop a daemon that is not the runtime recorded by this Chorale installation.');
  }
  if (runtime?.port && runtime.port !== port) {
    throw new Error('Refusing to stop a daemon that is not the runtime recorded by this Chorale installation.');
  }

  let targetPid = runtime?.pid ?? health.pid;
  if (!targetPid) {
    targetPid = await resolvePid(port);
  }

  if (!targetPid) {
    throw new Error('Refusing to stop a daemon that is not the runtime recorded by this Chorale installation.');
  }

  kill(targetPid, 'SIGTERM');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const alive = isAlive(targetPid);
    const healthy = await probe({ port });
    if (!alive && !healthy) {
      if (runtime?.pid === targetPid) {
        await remove(options.choraleHome);
      }
      return { stopped: true };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error('Chorale did not stop within two seconds.');
};

export const HELP_TEXT = `Chorale - Score-focused music workspace, agent skill, and MCP server

Usage:
  chorale [command] [options]

Commands:
  start            Start the Chorale background daemon and open the workspace in browser (default)
  status           Show status and runtime metadata of the running Chorale daemon
  stop             Gracefully stop the running Chorale daemon
  upgrade          Restart the verified daemon after a package update, preserving score data
  mcp              Start the MCP stdio server adapter for AI coding agents
  help             Display this help message
  version          Display version information

Options:
  -h, --help       Show help information
  -v, --version    Show version number
      --stdio      Start MCP server over stdio (alias for 'mcp')
      --serve      Run daemon in foreground (internal)
`;

export const runCli = async (options = {}) => {
  const args = options.args || process.argv.slice(2);
  const command = args[0] || 'start';
  const port = options.port || CHORALE_PORT;
  const logger = options.logger || console;
  const entrypoint = options.entrypoint || process.argv[1];
  const ensure = options.ensureDaemon || ensureDaemon;
  const probe = options.probe || probeHealth;

  if (args.includes('--serve')) {
    return runDaemon({ ...options, port });
  }

  if (command === 'help' || args.includes('--help') || args.includes('-h')) {
    logger.log(HELP_TEXT);
    return { statusCode: 0, help: true, text: HELP_TEXT };
  }

  if (command === 'version' || args.includes('--version') || args.includes('-v')) {
    logger.log(`chorale v${CHORALE_VERSION}`);
    return { statusCode: 0, version: CHORALE_VERSION };
  }

  if (command === 'mcp' || args.includes('--stdio')) {
    await ensure({ ...options, port, entrypoint });
    const store = new LocalDocumentStore();
    const views = new ViewSnapshotStore();
    const { server } = createMcpServer(store, views, port, (handlers) => proxyDaemonTools(handlers, port));
    await server.connect(new StdioServerTransport());
    return;
  }

  if (command === 'status') {
    const health = await probe({ port });
    if (!health) {
      logger.error('Chorale service is not running.');
      return { statusCode: 1 };
    }
    const read = options.readRuntime || readRuntime;
    const runtime = await read(options.choraleHome);
    const resolvedPid = health.pid ?? runtime?.pid ?? (await (options.resolveListeningPid || resolveListeningPid)(port));
    logger.log(`Chorale service is active on http://127.0.0.1:${port} (PID ${resolvedPid ?? 'unknown'}).`);
    return { health, runtime, pid: resolvedPid };
  }

  if (command === 'stop') {
    const result = await (options.stopDaemon || stopDaemon)({ ...options, port });
    logger.log(result.stopped ? 'Chorale service stopped.' : 'Chorale service is not running.');
    return result;
  }

  if (command === 'upgrade') {
    const stopped = await (options.stopDaemon || stopDaemon)({ ...options, port });
    const ensured = await ensure({ ...options, port, entrypoint });
    logger.log(stopped.stopped
      ? `Chorale service restarted at version ${ensured.health.version ?? 'unknown'}.`
      : `Chorale service started at version ${ensured.health.version ?? 'unknown'}.`);
    return { ...ensured, stopped: stopped.stopped };
  }

  if (command === 'start') {
    const { health, started } = await ensure({ ...options, port, entrypoint });
    logger.log(started
      ? `Chorale service started on http://127.0.0.1:${health.port || port}.`
      : `Chorale service is already running on http://127.0.0.1:${health.port || port} (no-op).`);
    await (options.openBrowser || openBrowser)(`http://127.0.0.1:${health.port || port}`);
    return { health, started };
  }

  logger.error(`Unknown command: ${command}\n\n${HELP_TEXT}`);
  return { statusCode: 1, error: `Unknown command: ${command}` };
};
