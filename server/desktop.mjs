import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { closeSync, existsSync, fchmodSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { describeDesktopExit } from './desktop-lifecycle.mjs';
import { resolveChoraleHome } from './runtime.mjs';

/** Launch the installed app without loading Vite or any development tooling. */
export async function launchDesktop(options = {}) {
  const root = options.packageRoot;
  const main = join(root, 'dist-electron/main.js');
  if (!existsSync(main) || !existsSync(join(root, 'dist-electron/preload.cjs'))) {
    throw new Error('The desktop build is missing. Reinstall Chorale, or run npm run build:electron in a source checkout. Use chorale --browser for the browser workspace.');
  }
  const require = createRequire(join(root, 'package.json'));
  const executable = options.electronPath || require('electron');
  const environment = { ...process.env, ...options.environment, CHORALE_NODE_EXECUTABLE: process.execPath };
  delete environment.ELECTRON_RUN_AS_NODE;
  const debug = options.debug === true;
  const logPath = join(options.choraleHome || resolveChoraleHome(environment), 'desktop.log');
  let logFile;
  let logStart = 0;
  let child;
  let startupTimer;
  let onClose;
  let onMessage;
  let onError;
  let stderr = '';
  const terminate = () => child?.kill('SIGTERM');
  try {
    if (!debug) {
      mkdirSync(options.choraleHome || resolveChoraleHome(environment), { recursive: true, mode: 0o700 });
      logFile = openSync(logPath, 'a+', 0o600);
      fchmodSync(logFile, 0o600);
      logStart = fstatSync(logFile).size;
    }
    child = (options.spawnImpl || spawn)(executable, [...(options.desktopArguments || []), main], {
      cwd: root, env: environment, detached: !debug,
      stdio: debug ? ['ignore', 'inherit', 'pipe'] : ['ignore', logFile, logFile, 'ipc'],
    });
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-16_384);
      (options.stderr || process.stderr).write(chunk);
    });
    if (debug) {
      process.once('SIGINT', terminate);
      process.once('SIGTERM', terminate);
    }
    return await new Promise((resolve, reject) => {
      onError = reject;
      child.once('error', onError);
      onClose = (code, signal) => {
        if (logFile !== undefined) {
          const end = fstatSync(logFile).size;
          const start = Math.min(end, Math.max(logStart, end - 16_384));
          const buffer = Buffer.alloc(end - start);
          stderr = buffer.subarray(0, readSync(logFile, buffer, 0, buffer.length, start)).toString();
        }
        const result = describeDesktopExit(code, signal, stderr, root);
        if (result.message) {
          (options.logger || console).error(debug ? result.message : `${result.message}\n${stderr.trim()}\nDesktop log: ${logPath}`);
        }
        resolve({ statusCode: result.exitCode });
      };
      child.once('close', onClose);
      if (!debug) {
        onMessage = (message) => {
          if (message?.type === 'chorale:desktop-ready') {
            resolve({ statusCode: 0, detached: true, pid: child.pid, logPath });
          }
        };
        child.on('message', onMessage);
        startupTimer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Chorale desktop did not become ready. See ${logPath} or run chorale --debug.`));
        }, options.startupTimeoutMs ?? 30_000);
      }
    });
  } finally {
    clearTimeout(startupTimer);
    process.removeListener('SIGINT', terminate);
    process.removeListener('SIGTERM', terminate);
    if (onClose) child?.removeListener('close', onClose);
    if (onMessage) child?.removeListener('message', onMessage);
    if (onError) child?.removeListener('error', onError);
    if (!debug && child) {
      // No IPC channel, pipes, handles, or terminal signal forwarding should
      // keep the CLI alive or tie the running app to its launching terminal.
      if (child.connected) child.disconnect();
      child.unref();
    }
    if (logFile !== undefined) closeSync(logFile);
  }
}
