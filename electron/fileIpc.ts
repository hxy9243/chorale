import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { FILE_IPC } from './ipcChannels';
import { isAllowedRendererUrl } from './ipcValidation';

const MAX_EXPORT_BYTES = 32 * 1024 * 1024;

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

const validateSaveTextFileInput = (input: unknown): SaveTextFileInput => {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid save request payload.');
  }
  const { suggestedName, contents } = input as Record<string, unknown>;
  if (
    typeof suggestedName !== 'string'
    || !isValidSuggestedFileName(suggestedName)
  ) {
    throw new Error('Invalid suggested file name.');
  }
  if (typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > MAX_EXPORT_BYTES) {
    throw new Error('Invalid file contents.');
  }
  return { suggestedName, contents };
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

  return () => {
    for (const channel of Object.values(FILE_IPC)) {
      ipcMain.removeHandler(channel);
    }
  };
};
