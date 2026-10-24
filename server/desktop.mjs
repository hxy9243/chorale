import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describeDesktopExit } from './desktop-lifecycle.mjs';

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
  const child = (options.spawnImpl || spawn)(executable, [...(options.desktopArguments || []), main], {
    cwd: root, env: environment, stdio: ['ignore', 'inherit', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-16_384);
    (options.stderr || process.stderr).write(chunk);
  });
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', terminate);
  process.once('SIGTERM', terminate);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        const result = describeDesktopExit(code, signal, stderr, root);
        if (result.message) (options.logger || console).error(result.message);
        resolve({ statusCode: result.exitCode });
      });
    });
  } finally {
    process.removeListener('SIGINT', terminate);
    process.removeListener('SIGTERM', terminate);
  }
}
