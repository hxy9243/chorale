import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { SCAN_IPC } from './ipcChannels';
import { isAllowedRendererUrl } from './ipcValidation';
import { ScoreScanner } from './scoreScan';

export const registerScanIPC = (getWindow: () => BrowserWindow | null, projectDirectory: string) => {
  const scanner = new ScoreScanner({ projectDirectory });
  const assertSender = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id || !isAllowedRendererUrl(event.senderFrame?.url ?? '')) {
      throw new Error('Refused scan request from an unexpected renderer.');
    }
  };
  ipcMain.handle(SCAN_IPC.status, (event) => { assertSender(event); return scanner.status(); });
  ipcMain.handle(SCAN_IPC.scan, (event, request: unknown) => { assertSender(event); return scanner.scan(request); });
  ipcMain.handle(SCAN_IPC.cancel, (event) => { assertSender(event); scanner.cancel(); });
  ipcMain.handle(SCAN_IPC.openSourceFolder, async (event, jobId: string) => {
    assertSender(event);
    if (typeof jobId !== 'string') throw new Error('Invalid scan identifier.');
    const error = await shell.openPath(scanner.sourceFolder(jobId));
    if (error) throw new Error('Could not open the source folder.');
  });
  return () => {
    scanner.cancel();
    for (const channel of Object.values(SCAN_IPC)) ipcMain.removeHandler(channel);
  };
};
