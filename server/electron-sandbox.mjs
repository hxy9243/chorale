import { spawnSync } from 'node:child_process';
import { closeSync, lstatSync, openSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function configureElectronSandbox({
  platform = process.platform,
  uid = process.getuid?.(),
  electronPath = () => require('electron'),
  stat = lstatSync,
  run = spawnSync,
  stdio = 'inherit',
  interactive = Boolean(process.stdin.isTTY),
} = {}) {
  if (platform !== 'linux') return 'skipped';
  const helper = join(dirname(electronPath()), 'chrome-sandbox');
  const ready = (info) => info.isFile() && info.uid === 0 && (info.mode & 0o7777) === 0o4755;
  const info = stat(helper);
  if (!info.isFile()) throw new Error(`Electron sandbox helper is not a regular file: ${helper}`);
  if (ready(info)) return 'ready';
  for (const [command, args] of [['chown', ['root', helper]], ['chmod', ['4755', helper]]]) {
    const result = uid === 0
      ? run(command, args, { stdio })
      : run('sudo', [...(interactive ? [] : ['-n']), command, ...args], { stdio });
    if (result.error || result.status !== 0) {
      throw new Error(`Could not configure Electron's Linux sandbox helper. ${result.error?.message || `${command} failed.`}\nRun npm run setup:electron-sandbox from a regular terminal.`);
    }
  }
  if (!ready(stat(helper))) throw new Error(`Electron sandbox permissions did not persist: ${helper}`);
  return 'configured';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let terminal;
  try {
    // npm may run lifecycle scripts with redirected stdin/output. Use the
    // controlling terminal for sudo, but never prompt in CI or without a tty.
    if (process.platform === 'linux' && !process.env.CI) {
      try { terminal = openSync('/dev/tty', 'r+'); } catch { /* Unattended install. */ }
    }
    const result = configureElectronSandbox({
      interactive: terminal !== undefined,
      stdio: terminal === undefined ? 'inherit' : [terminal, terminal, terminal],
    });
    if (result === 'configured') {
      const message = 'Configured Electron Linux sandbox helper (root, 4755).\n';
      if (terminal !== undefined) writeSync(terminal, message);
      else console.error(message.trim());
    }
  } catch (error) {
    const message = `Electron sandbox setup: ${error.message}\n`;
    if (terminal !== undefined) writeSync(terminal, message);
    else console.error(message.trim());
    if (!process.argv.includes('--best-effort')) process.exitCode = 1;
  } finally {
    if (terminal !== undefined) closeSync(terminal);
  }
}
