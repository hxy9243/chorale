import {
  app,
  BrowserWindow,
  Menu,
  net,
  protocol,
  session,
  shell,
} from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIConnectionStore } from './ai/connectionStore';
import { AIController } from './ai/controller';
import { ElectronCodexOAuthAdapter } from './ai/codexOAuth';
import { ElectronSecretCipher } from './ai/electronCipher';
import { registerAIIPC } from './ipc';
import { registerFileIPC } from './fileIpc';
import { registerScanIPC } from './scanIpc';
import { JSONLAgentTraceStore } from './ai/agentTrace';
import { resolveChoraleDataPaths } from './dataPaths';
import { ensureDesktopDaemon } from './daemon';
import { offerClientSetup, showClientSetup } from './clientSetup';

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}]);
app.setName('Chorale');

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(desktopDirectory, '..');
const rendererDirectory = path.join(projectDirectory, 'dist');
const preloadPath = path.join(desktopDirectory, 'preload.cjs');

let mainWindow: BrowserWindow | null = null;
let controller: AIController | null = null;
let removeIPCHandlers: (() => void) | null = null;
let removeFileIPCHandlers: (() => void) | null = null;
let removeScanIPCHandlers: (() => void) | null = null;
let storageFlushed = false;
let daemonUrl = 'http://127.0.0.1:1685';
// Explicit isolation is useful for local smoke tests; normal launches keep the existing profile.
if (process.env.CHORALE_DESKTOP_USER_DATA) app.setPath('userData', process.env.CHORALE_DESKTOP_USER_DATA);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const developmentRendererUrl = () => {
  const argument = process.argv.find((item) => item.startsWith('--renderer-url='));
  if (!argument) return null;
  const value = argument.slice('--renderer-url='.length);
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5173'
  ) {
    throw new Error('Invalid development renderer URL.');
  }
  return url.toString();
};

const installAppProtocol = () => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'chorale') return new Response('Not found', { status: 404 });

    if (url.pathname.startsWith('/v1/') || url.pathname === '/sse') {
      return fetch(`${daemonUrl}${url.pathname}${url.search}`, {
        method: request.method,
        headers: { 'content-type': 'application/json' },
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: await request.text() } : {}),
        signal: request.signal,
      });
    }

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const candidate = path.resolve(rendererDirectory, relativePath);
    const rendererPrefix = `${rendererDirectory}${path.sep}`;
    const target = (
      candidate === rendererDirectory ||
      !candidate.startsWith(rendererPrefix)
    )
      ? path.join(rendererDirectory, 'index.html')
      : candidate;
    return net.fetch(pathToFileURL(target).toString());
  });
};

const createWindow = async () => {
  removeScanIPCHandlers?.();
  removeScanIPCHandlers = registerScanIPC(() => mainWindow, projectDirectory);
  mainWindow = new BrowserWindow({
    title: 'Chorale',
    width: 1480,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#f4f1ea',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: 'Chorale', submenu: [
      { label: 'Connect AI apps…', click: () => { if (mainWindow) void showClientSetup(mainWindow, projectDirectory); } },
      { type: 'separator' as const }, { role: 'quit' as const },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' },
  ]));
  mainWindow.setMenuBarVisibility(true);

  const expectedDevelopmentUrl = developmentRendererUrl();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const target = new URL(targetUrl);
      const allowed = expectedDevelopmentUrl
        ? target.origin === new URL(expectedDevelopmentUrl).origin
        : target.protocol === 'app:' && target.hostname === 'chorale';
      if (!allowed) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame && mainWindow?.webContents.getURL()) {
      controller?.abortAll();
      removeScanIPCHandlers?.();
      removeScanIPCHandlers = registerScanIPC(() => mainWindow, projectDirectory);
    }
  });
  mainWindow.webContents.on('render-process-gone', () => {
    controller?.abortAll();
    removeScanIPCHandlers?.();
    removeScanIPCHandlers = null;
  });
  mainWindow.webContents.on('destroyed', () => controller?.abortAll());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
  mainWindow.on('closed', () => {
    removeScanIPCHandlers?.();
    removeScanIPCHandlers = null;
    mainWindow = null;
  });

  if (expectedDevelopmentUrl) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await mainWindow.loadURL(expectedDevelopmentUrl);
        break;
      } catch (err) {
        if (attempt === 9) throw err;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  } else {
    await mainWindow.loadURL('app://chorale/index.html');
  }
};

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    daemonUrl = await ensureDesktopDaemon(projectDirectory);
    installAppProtocol();
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    const dataPaths = resolveChoraleDataPaths(app.getPath('userData'));
    const store = new AIConnectionStore(dataPaths.root, new ElectronSecretCipher());
    await store.initialize();
    const traceStore = new JSONLAgentTraceStore(dataPaths.agentTraces);
    controller = new AIController(
      store,
      new ElectronCodexOAuthAdapter(),
      traceStore,
      (directory) => shell.openPath(directory),
    );
    removeIPCHandlers = registerAIIPC(controller, () => mainWindow);
    removeFileIPCHandlers = registerFileIPC(() => mainWindow);
    await createWindow();
    // The CLI only stays connected until the initial desktop window loads.
    // A send callback also handles a launching terminal disappearing early.
    if (process.connected) process.send?.({ type: 'chorale:desktop-ready' }, () => {});
    if (mainWindow) void offerClientSetup(mainWindow, projectDirectory).catch(error => console.error('Client setup could not open:', error.message));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  }).catch((error) => {
    console.error('Chorale desktop failed to start:', error);
    app.exit(1);
  });
}

app.on('before-quit', (event) => {
  controller?.abortAll();
  if (storageFlushed) return;
  event.preventDefault();
  session.defaultSession.flushStorageData();
  setImmediate(() => {
    storageFlushed = true;
    removeIPCHandlers?.();
    removeFileIPCHandlers?.();
    removeScanIPCHandlers?.();
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Development restarts and terminal shutdowns should follow the normal quit
// lifecycle so renderer/network children release their sockets before relaunch.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => app.quit());
}
