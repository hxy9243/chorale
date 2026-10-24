import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { build, createServer } from 'vite';
import { describeDesktopExit } from './electron-lifecycle.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const electronArguments = process.argv.slice(2).filter((argument) => argument !== '--production');
const environment = { ...process.env, CHORALE_NODE_EXECUTABLE: process.execPath };
delete environment.ELECTRON_RUN_AS_NODE;
let desktop;
let renderer;
let stopping = false;
let restarting = false;
let restartTimer;
const watchers = [];

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  desktop?.kill('SIGTERM');
  await Promise.all(watchers.map((watcher) => watcher.close()));
  await renderer?.close();
  process.exitCode = code;
}

function launchDesktop() {
  console.log('Launching Electron…');
  let desktopStderr = '';
  desktop = spawn(require('electron'), [
    ...electronArguments,
    join(root, 'dist-electron/main.js'),
    ...(!production ? ['--renderer-url=http://127.0.0.1:5173'] : []),
  ], { cwd: root, env: environment, stdio: ['inherit', 'inherit', 'pipe'] });
  desktop.stderr.on('data', (chunk) => {
    desktopStderr = (desktopStderr + chunk.toString()).slice(-16_384);
    process.stderr.write(chunk);
  });
  desktop.on('error', (error) => { console.error(error.message); void stop(1); });
  desktop.on('close', (code, signal) => {
    if (stopping || restarting) return;
    const result = describeDesktopExit(code, signal, desktopStderr, root);
    if (result.message) console.error(result.message);
    void stop(result.exitCode);
  });
}

async function restartDesktop() {
  if (stopping || restarting) return;
  restarting = true;
  if (desktop && desktop.exitCode === null && desktop.signalCode === null) {
    const exited = new Promise((resolveExit) => desktop.once('close', resolveExit));
    desktop.kill('SIGTERM');
    await exited;
  }
  if (!stopping) launchDesktop();
  restarting = false;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop(); });
try {
  if (!production) {
    renderer = await createServer({ root, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
    await renderer.listen();
    renderer.printUrls();
    await Promise.all(['vite.main.config.ts', 'vite.preload.config.ts'].map(async (config) => {
      const watcher = await build({ root, configFile: join(root, config), build: { watch: {}, emptyOutDir: false } });
      watchers.push(watcher);
      await new Promise((resolveBuild, rejectBuild) => {
        let initialized = false;
        watcher.on('event', (event) => {
          if (event.code === 'ERROR') {
            console.error(event.error);
            if (!initialized) rejectBuild(event.error);
          }
          if (event.code !== 'END') return;
          if (!initialized) { initialized = true; resolveBuild(); return; }
          clearTimeout(restartTimer);
          restartTimer = setTimeout(() => { void restartDesktop(); }, 300);
        });
      });
    }));
  }
  if (!stopping) launchDesktop();
} catch (error) {
  console.error('Desktop startup failed:', error.message);
  await stop(1);
}
