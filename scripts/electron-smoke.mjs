import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectDirectory = path.resolve(import.meta.dirname, '..');
const electronBinary = path.join(
  projectDirectory,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
const mainEntry = path.join(projectDirectory, 'dist-electron', 'main.js');
const launchedChildren = new Set();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const availablePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const waitForTarget = async (port) => {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((candidate) => candidate.url === 'app://chorale/index.html');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Electron has not opened its debugging socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the Electron renderer.');
};

const connectCDP = async (url) => {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        const result = await call('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description ?? 'Renderer evaluation failed.');
        }
        return result.result.value;
      } catch (error) {
        if (!String(error).includes('Execution context was destroyed')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error('Electron renderer did not finish committing its navigation.');
  };
  return { socket, call, evaluate };
};

const launch = async (profileDirectory) => {
  const port = await availablePort();
  const environment = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const args = [
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
  ];
  if (process.platform === 'linux') args.push('--ozone-platform=x11');
  args.push(mainEntry);
  const child = spawn(electronBinary, args, {
    cwd: projectDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  launchedChildren.add(child);
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => {
    launchedChildren.delete(child);
    resolve({ code, signal });
  }));
  const target = await waitForTarget(port);
  return { child, output: () => output, exited, target };
};

const closeCleanly = async (runtime, cdp) => {
  try {
    await cdp.evaluate('window.close(); true');
  } catch (error) {
    if (!String(error).includes('Execution context was destroyed')) throw error;
  }
  const result = await Promise.race([
    runtime.exited,
    new Promise((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
  if (result === null) {
    runtime.child.kill('SIGTERM');
    throw new Error('Electron did not exit after its renderer window closed.');
  }
};

const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'chorale-electron-smoke-'));
try {
  const first = await launch(profileDirectory);
  const firstCDP = await connectCDP(first.target.webSocketDebuggerUrl);
  const shellState = await firstCDP.evaluate(`(async () => {
    const waitForElement = async (selector) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const element = document.querySelector(selector);
        if (element) return element;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return null;
    };
    const bridge = window.choraleAI;
    const sheet = await waitForElement('.sheet-music-card');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sheetZoomBefore = sheet?.querySelector('.scale-val')?.textContent;
    sheet?.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const sheetZoomAfter = sheet?.querySelector('.scale-val')?.textContent;
    const interfaceZoomAfterSheet = document.documentElement.style.getPropertyValue('--ui-zoom');

    const chatResize = document.querySelector('.chat-rail-resize-handle');
    if (chatResize) {
      chatResize.setPointerCapture = () => undefined;
      chatResize.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: chatResize.getBoundingClientRect().x,
        pointerId: 1,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: -2000,
        pointerId: 1,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const chatWidth = document.querySelector('.right-panel')?.getBoundingClientRect().width;
    const chatWidthLimit = Math.floor(window.innerWidth / 3);
    window.dispatchEvent(new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const rightEdgeIsChat = document.elementsFromPoint(window.innerWidth - 1, 100)
      .some((element) => Boolean(element.closest('.right-panel')));
    const zoomGeometry = {
      bodyRight: document.body.getBoundingClientRect().right,
      shellRight: document.querySelector('.chorale-app-shell')?.getBoundingClientRect().right,
      bodyWidth: getComputedStyle(document.body).width,
      viewportWidth: window.innerWidth,
      bodyBottom: document.body.getBoundingClientRect().bottom,
      bodyHeight: getComputedStyle(document.body).height,
      viewportHeight: window.innerHeight,
    };

    const gear = await waitForElement('[aria-label="Open settings"]');
    gear?.click();
    const settingsTitle = await waitForElement('#ai-settings-title');
    const provider = document.querySelector('.ai-add-connection select');
    const settingsTabs = document.querySelector('.ai-settings-tabs');
    const settingsTabsDirection = settingsTabs ? getComputedStyle(settingsTabs).flexDirection : null;
    const settingsHasSubtitle = Boolean(document.querySelector('.ai-settings-header p'));
    const composerBottom = document.querySelector('.agent-composer')?.getBoundingClientRect().bottom;
    const panelBottom = document.querySelector('.right-panel')?.getBoundingClientRect().bottom;
    const playbackBottom = document.querySelector('.playback-dock-container')?.getBoundingClientRect().bottom;
    const workspaceBottom = document.querySelector('.central-workspace')?.getBoundingClientRect().bottom;
    localStorage.setItem('chorale.electron-smoke', 'persisted');
    document.querySelector('[aria-label="Close settings"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    document.querySelector('[aria-label="Close assistant"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      url: location.href,
      title: document.title,
      hasNodeRequire: typeof window.require !== 'undefined',
      hasNodeProcess: typeof window.process !== 'undefined',
      bridgeMethods: bridge ? Object.keys(bridge).sort() : [],
      connections: bridge ? await bridge.listConnections() : null,
      settingsTitle: settingsTitle?.textContent,
      settingsTabsDirection,
      settingsHasSubtitle,
      providerCount: provider?.querySelectorAll('option').length ?? 0,
      sheetZoomBefore,
      sheetZoomAfter,
      interfaceZoomAfterSheet,
      chatWidth,
      chatWidthLimit,
      rightEdgeIsChat,
      zoomGeometry,
      interfaceZoom: document.documentElement.style.getPropertyValue('--ui-zoom'),
      computedInterfaceZoom: getComputedStyle(document.body).zoom,
      composerBottom,
      panelBottom,
      playbackBottom,
      workspaceBottom,
      viewportBottom: window.innerHeight,
      storedChatOpen: localStorage.getItem('chorale.workspace.chatOpen'),
      storedChatWidth: Number(localStorage.getItem('chorale.workspace.chatWidth')),
    };
  })()`);
  assert(shellState.url === 'app://chorale/index.html', 'Production renderer did not use app://chorale.');
  assert(shellState.title.includes('Chorale'), 'Production renderer title is missing.');
  assert(shellState.hasNodeRequire === false, 'Renderer unexpectedly exposes Node require.');
  assert(shellState.hasNodeProcess === false, 'Renderer unexpectedly exposes Node process.');
  assert(shellState.bridgeMethods.includes('sendChat'), 'Typed preload bridge is unavailable.');
  assert(shellState.bridgeMethods.includes('startCodexLogin'), 'Codex bridge method is unavailable.');
  assert(Array.isArray(shellState.connections), 'Connection listing did not cross the preload bridge.');
  assert(shellState.connections.length === 0, 'Electron smoke profile was not isolated.');
  assert(shellState.settingsTitle === 'Settings', 'Settings modal did not open.');
  assert(
    shellState.settingsTabsDirection === 'column',
    `Settings tabs are not vertical (${shellState.settingsTabsDirection}).`,
  );
  assert(shellState.settingsHasSubtitle === false, 'Settings header still contains a subtitle.');
  assert(shellState.providerCount === 6, 'Settings modal does not list all six provider types.');
  assert(shellState.sheetZoomBefore === '100%', `Sheet zoom did not start at 100% (${shellState.sheetZoomBefore}).`);
  assert(
    shellState.sheetZoomAfter === '110%',
    `Ctrl+wheel over the sheet did not zoom only the sheet (${shellState.sheetZoomAfter}).`,
  );
  assert(shellState.interfaceZoomAfterSheet === '1', 'Sheet zoom unexpectedly changed interface zoom.');
  assert(
    Math.abs(shellState.chatWidth - shellState.chatWidthLimit) <= 1,
    'Chat panel did not resize to one third of the viewport.',
  );
  assert(shellState.interfaceZoom === '1.1', 'Ctrl+wheel did not increase interface zoom.');
  assert(shellState.computedInterfaceZoom === '1.1', 'Interface zoom was not applied to the renderer.');
  assert(
    shellState.rightEdgeIsChat,
    `Interface zoom detached the chat panel from the visual right edge (${JSON.stringify(shellState.zoomGeometry)}).`,
  );
  assert(
    Math.abs(shellState.panelBottom - shellState.viewportBottom) <= 1
      && shellState.panelBottom - shellState.composerBottom <= 20,
    `Chat composer is not anchored to the visible window bottom (${shellState.composerBottom}, panel ${shellState.panelBottom}, viewport ${shellState.viewportBottom}, geometry ${JSON.stringify(shellState.zoomGeometry)}).`,
  );
  assert(
    Math.abs(shellState.workspaceBottom - shellState.playbackBottom) <= 1
      && Math.abs(shellState.playbackBottom - shellState.viewportBottom) <= 1,
    `Playback dock is not anchored to the visible window bottom (${shellState.playbackBottom}, workspace ${shellState.workspaceBottom}, viewport ${shellState.viewportBottom}).`,
  );
  assert(shellState.storedChatOpen === 'false', 'Closed chat state was not persisted.');
  assert(Number.isFinite(shellState.storedChatWidth), 'Resized chat width was not persisted.');
  await closeCleanly(first, firstCDP);
  firstCDP.socket.close();
  assert(!first.output().includes('violates the following Content Security Policy'), (
    `Electron reported a CSP violation:\n${first.output()}`
  ));

  const second = await launch(profileDirectory);
  const secondCDP = await connectCDP(second.target.webSocketDebuggerUrl);
  const persisted = await secondCDP.evaluate(`(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        if (document.readyState !== 'loading') {
          const value = localStorage.getItem('chorale.electron-smoke');
          const showChat = document.querySelector('[title="Show score chat"]');
          if (value !== null && showChat) {
            const initiallyOpen = Boolean(document.querySelector('[aria-label="Current sheet assistant"]'));
            showChat.click();
            await new Promise((resolve) => setTimeout(resolve, 25));
            return {
              value,
              initiallyOpen,
              reopened: Boolean(document.querySelector('[aria-label="Current sheet assistant"]')),
              reopenedWidth: document.querySelector('.right-panel')?.getBoundingClientRect().width,
              storedWidth: Number(localStorage.getItem('chorale.workspace.chatWidth')),
              interfaceZoom: Number(getComputedStyle(document.body).zoom),
            };
          }
        }
      } catch {
        // The app:// navigation can be visible to CDP before its origin is committed.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Renderer storage origin was not ready after restart.');
  })()`);
  assert(persisted.value === 'persisted', 'Renderer localStorage did not survive an Electron restart.');
  assert(persisted.initiallyOpen === false, 'Chat open state did not survive restart.');
  assert(persisted.reopened === true, 'Chat could not be reopened after restoring its closed state.');
  assert(
    Math.abs(persisted.reopenedWidth - persisted.storedWidth * persisted.interfaceZoom) <= 1,
    `Reopened chat did not restore its persisted width (${persisted.reopenedWidth} vs ${persisted.storedWidth}).`,
  );
  await closeCleanly(second, secondCDP);
  secondCDP.socket.close();
  assert(!second.output().includes('violates the following Content Security Policy'), (
    `Electron reported a CSP violation after restart:\n${second.output()}`
  ));

  console.log('Electron smoke passed: app protocol, sandboxed bridge, settings UI, clean restart, and localStorage persistence.');
} finally {
  for (const child of launchedChildren) child.kill('SIGTERM');
  // Chromium helper processes can finish a final profile write just after the
  // browser process exits, so let recursive removal retry that short race.
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 100,
  });
}
