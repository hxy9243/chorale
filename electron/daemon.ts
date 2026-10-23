import { spawn } from 'node:child_process';
import path from 'node:path';

/** Reuse the CLI-owned service; desktop shutdown must not stop other clients. */
export async function ensureDesktopDaemon(projectDirectory: string): Promise<string> {
  const port = Number(process.env.CHORALE_PORT || 1685);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CHORALE_PORT.');
  const base = `http://127.0.0.1:${port}`;
  const healthy = async () => {
    try {
      const response = await fetch(`${base}/v1/health`, { signal: AbortSignal.timeout(1000) });
      if (!response.ok) return false;
      const health = await response.json() as { service?: string; status?: string };
      return health.service === 'chorale-service' && health.status === 'ok';
    } catch { return false; }
  };
  if (await healthy()) return base;
  const child = spawn(process.env.CHORALE_NODE_EXECUTABLE || process.execPath, [path.join(projectDirectory, 'bin/chorale.mjs'), '--serve'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  let startupError: Error | undefined;
  child.on('error', (error) => { startupError = error; });
  child.unref();
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startupError) throw startupError;
    if (await healthy()) return base;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`The shared Chorale service could not start on port ${port}. Close the conflicting service and try again.`);
}
