import {
  app,
  BrowserWindow,
  net,
  protocol,
  session,
} from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIConnectionStore } from './ai/connectionStore';
import { AIController } from './ai/controller';
import { ElectronCodexOAuthAdapter } from './ai/codexOAuth';
import { ElectronSecretCipher } from './ai/electronCipher';
import { registerAIIPC } from './ipc';

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
let storageFlushed = false;

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
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'chorale') return new Response('Not found', { status: 404 });

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
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f1ea',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

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
    if (isMainFrame && mainWindow?.webContents.getURL()) controller?.abortAll();
  });
  mainWindow.webContents.on('render-process-gone', () => controller?.abortAll());
  mainWindow.webContents.on('destroyed', () => controller?.abortAll());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (expectedDevelopmentUrl) {
    await mainWindow.loadURL(expectedDevelopmentUrl);
  } else {
    await mainWindow.loadURL('app://chorale/index.html');
  }
};

app.whenReady().then(async () => {
  installAppProtocol();
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  const store = new AIConnectionStore(
    path.join(app.getPath('userData'), 'chorale-data'),
    new ElectronSecretCipher(),
  );
  await store.initialize();
  controller = new AIController(store, new ElectronCodexOAuthAdapter());
  removeIPCHandlers = registerAIIPC(controller, () => mainWindow);
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch((error) => {
  console.error('Chorale desktop failed to start:', error);
  app.exit(1);
});

app.on('before-quit', (event) => {
  controller?.abortAll();
  if (storageFlushed) return;
  event.preventDefault();
  session.defaultSession.flushStorageData();
  setImmediate(() => {
    storageFlushed = true;
    removeIPCHandlers?.();
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
