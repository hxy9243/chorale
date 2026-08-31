import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FILE_IPC } from './ipcChannels';
import { isAllowedRendererUrl } from './ipcValidation';

const MAX_EXPORT_BYTES = 64 * 1024 * 1024;


const isValidSuggestedFileName = (name: string): boolean => {
  if (name.length < 1 || name.length > 200) return false;
  return name.split('').every((character) => {
    if (character.charCodeAt(0) < 32) return false;
    return !/[\\/:*?"<>|]/.test(character);
  });
};

export type SaveTextFileInput = Readonly<{
  suggestedName: string;
  contents: string;
}>;

export type SaveTextFileResult = Readonly<{
  saved: boolean;
  path?: string;
}>;

const validateSaveTextFileInput = (...args: unknown[]): SaveTextFileInput => {
  const [first, second] = args;
  if (typeof first === 'string' && typeof second === 'string') {
    if (!isValidSuggestedFileName(first)) throw new Error('Invalid suggested file name.');
    if (Buffer.byteLength(second, 'utf8') > MAX_EXPORT_BYTES) throw new Error('Invalid file contents.');
    return { suggestedName: first, contents: second };
  }

  const input = first;
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid save request payload.');
  }
  const record = input as Record<string, unknown>;
  const suggestedName = record.suggestedName;
  if (
    typeof suggestedName !== 'string'
    || !isValidSuggestedFileName(suggestedName)
  ) {
    throw new Error('Invalid suggested file name.');
  }
  const payload = typeof record.contents === 'string'
    ? record.contents
    : typeof record.html === 'string'
      ? record.html
      : typeof record.body === 'string'
        ? record.body
        : typeof record.text === 'string'
          ? record.text
          : null;
  if (payload === null || Buffer.byteLength(payload, 'utf8') > MAX_EXPORT_BYTES) {
    throw new Error('Invalid file contents.');
  }
  return { suggestedName, contents: payload };
};

export type SavePdfFileInput = Readonly<{
  suggestedName: string;
  html: string;
  landscape?: boolean;
}>;

export type SavePdfFileResult = Readonly<{
  saved: boolean;
  path?: string;
}>;

const validateSavePdfFileInput = (...args: unknown[]): SavePdfFileInput => {
  const [first, second, third] = args;
  if (typeof first === 'string' && typeof second === 'string') {
    if (!isValidSuggestedFileName(first)) throw new Error('Invalid suggested file name.');
    if (Buffer.byteLength(second, 'utf8') > MAX_EXPORT_BYTES) throw new Error('Invalid file contents.');
    return {
      suggestedName: first,
      html: second,
      landscape: typeof third === 'boolean' ? third : false,
    };
  }

  const input = first;
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid save request payload.');
  }
  const record = input as Record<string, unknown>;
  const suggestedName = record.suggestedName;
  if (
    typeof suggestedName !== 'string'
    || !isValidSuggestedFileName(suggestedName)
  ) {
    throw new Error('Invalid suggested file name.');
  }
  const payload = typeof record.html === 'string'
    ? record.html
    : typeof record.contents === 'string'
      ? record.contents
      : typeof record.body === 'string'
        ? record.body
        : typeof record.text === 'string'
          ? record.text
          : null;
  if (payload === null || Buffer.byteLength(payload, 'utf8') > MAX_EXPORT_BYTES) {
    throw new Error('Invalid file contents.');
  }
  return {
    suggestedName,
    html: payload,
    landscape: typeof record.landscape === 'boolean' ? record.landscape : false,
  };
};




const assertSender = (
  event: IpcMainInvokeEvent,
  getWindow: () => BrowserWindow | null,
) => {
  const window = getWindow();
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('Refused file request from an unexpected renderer.');
  }
  if (!isAllowedRendererUrl(event.senderFrame?.url ?? '')) {
    throw new Error('Refused file request from an unexpected origin.');
  }
};

export const registerFileIPC = (getWindow: () => BrowserWindow | null) => {
  ipcMain.handle(
    FILE_IPC.saveTextFile,
    async (event, input: unknown): Promise<SaveTextFileResult> => {
      assertSender(event, getWindow);
      const { suggestedName, contents } = validateSaveTextFileInput(input);
      const window = getWindow();
      if (!window || window.isDestroyed()) return { saved: false };

      const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedName,
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) {
        return { saved: false };
      }
      await writeFile(result.filePath, contents, 'utf8');
      return { saved: true, path: result.filePath };
    },
  );

  ipcMain.handle(
    FILE_IPC.savePdfFile,
    async (event, input: unknown): Promise<SavePdfFileResult> => {
      assertSender(event, getWindow);
      const { suggestedName, html, landscape } = validateSavePdfFileInput(input);
      const window = getWindow();
      if (!window || window.isDestroyed()) return { saved: false };

      const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedName,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) {
        return { saved: false };
      }

      const tempDirectory = app.getPath('temp');
      const tempFilePath = path.join(tempDirectory, `chorale-print-${randomUUID()}.html`);
      await writeFile(tempFilePath, html, 'utf8');

      const printWindow = new BrowserWindow({
        show: false,
        width: 1200,
        height: 800,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      try {
        await printWindow.loadURL(pathToFileURL(tempFilePath).toString());
        const pdfBuffer = await printWindow.webContents.printToPDF({
          landscape: landscape ?? false,
          printBackground: true,
          pageSize: 'A4',
          margins: {
            marginType: 'none',
          },
        });

        await writeFile(result.filePath, pdfBuffer);
        return { saved: true, path: result.filePath };
      } finally {
        if (!printWindow.isDestroyed()) {
          printWindow.destroy();
        }
        await unlink(tempFilePath).catch(() => {});
      }
    },
  );


  return () => {
    for (const channel of Object.values(FILE_IPC)) {
      ipcMain.removeHandler(channel);
    }
  };
};

