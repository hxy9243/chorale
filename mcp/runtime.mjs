import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const CHORALE_PORT = 1685;
export const HEALTH_PATH = '/v1/health';

export class RuntimeLockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuntimeLockError';
  }
}

export const resolveChoraleHome = (environment = process.env) => resolve(
  environment.CHORALE_HOME || join(homedir(), '.chorale'),
);

export const runtimePaths = (choraleHome = resolveChoraleHome()) => ({
  directory: choraleHome,
  runtime: join(choraleHome, 'runtime.json'),
  lock: join(choraleHome, 'runtime.lock'),
});

export const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

const readJson = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
};

const writeJsonAtomically = async (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
};

export const readRuntime = async (choraleHome) => readJson(runtimePaths(choraleHome).runtime);

export const writeRuntime = async (runtime, choraleHome) => {
  const paths = runtimePaths(choraleHome);
  await mkdir(paths.directory, { recursive: true });
  await writeJsonAtomically(paths.runtime, runtime);
};

export const removeRuntime = async (choraleHome) => {
  const paths = runtimePaths(choraleHome);
  await rm(paths.runtime, { force: true });
};

export const acquireRuntimeLock = async (options = {}) => {
  const choraleHome = options.choraleHome || resolveChoraleHome(options.environment);
  const paths = runtimePaths(choraleHome);
  const pid = options.pid || process.pid;
  await mkdir(paths.directory, { recursive: true });

  const acquire = async () => {
    try {
      await writeFile(paths.lock, `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() })}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      return {
        choraleHome,
        async release() {
          await rm(paths.lock, { force: true });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner = await readJson(paths.lock);
      if (!owner) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
        owner = await readJson(paths.lock);
      }
      if (owner?.pid && isProcessAlive(owner.pid)) {
        throw new RuntimeLockError(`Chorale daemon startup is already owned by process ${owner.pid}.`);
      }
      await rm(paths.lock, { force: true });
      return acquire();
    }
  };

  return acquire();
};

export const healthUrl = (port = CHORALE_PORT) => `http://127.0.0.1:${port}${HEALTH_PATH}`;

export const probeHealth = async (options = {}) => {
  const port = options.port || CHORALE_PORT;
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(healthUrl(port), { signal: AbortSignal.timeout(options.timeoutMs || 800) });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.service === 'chorale-service' ? payload : null;
  } catch {
    return null;
  }
};

export const waitForHealthyDaemon = async (options = {}) => {
  const attempts = options.attempts || 40;
  const delayMs = options.delayMs || 50;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await probeHealth(options);
    if (health) return health;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  return null;
};
