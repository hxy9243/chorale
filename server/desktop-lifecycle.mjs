import { join } from 'node:path';

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function describeDesktopExit(code, signal, stderr, projectDirectory) {
  if (code === 0 && !signal) return { exitCode: 0, message: '' };
  const exitCode = Number.isInteger(code) && code > 0 ? code : 1;
  let message = signal
    ? `Electron exited with signal ${signal}.`
    : `Electron exited with code ${exitCode}.`;
  if (/SUID sandbox helper binary[\s\S]*not configured correctly/.test(stderr)) {
    const helper = shellQuote(join(projectDirectory, 'node_modules/electron/dist/chrome-sandbox'));
    message += `\nConfigure Electron's Linux sandbox helper once from your regular terminal:\nsudo chown root ${helper}\nsudo chmod 4755 ${helper}\nThen run npm run dev:electron again.`;
  }
  return { exitCode, message };
}
