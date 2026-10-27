import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { SCAN_IPC } from './ipcChannels';
import { isAllowedRendererUrl } from './ipcValidation';
import { ScanJobs } from './scanJobs';
import { ScoreScanner } from './scoreScan';

export const registerScanIPC = (getWindow: () => BrowserWindow | null, projectDirectory: string) => {
  const scanner = new ScoreScanner({ projectDirectory });
  const jobs = new ScanJobs(scanner);
  const assertSender = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id || !isAllowedRendererUrl(event.senderFrame?.url ?? '')) {
      throw new Error('Refused scan request from an unexpected renderer.');
    }
  };
  ipcMain.handle(SCAN_IPC.status, (event) => { assertSender(event); return scanner.status(); });
  ipcMain.handle(SCAN_IPC.scan, (event, request: unknown) => { assertSender(event); return scanner.scan(request); });
  ipcMain.handle(SCAN_IPC.start, (event, request: unknown) => { assertSender(event); return jobs.start(request); });
  ipcMain.handle(SCAN_IPC.listJobs, (event) => { assertSender(event); return jobs.list(); });
  ipcMain.handle(SCAN_IPC.result, (event, id: string) => { assertSender(event); return jobs.result(id); });
  ipcMain.handle(SCAN_IPC.fail, (event, id: string, message: string) => { assertSender(event); return jobs.fail(id, message); });
  ipcMain.handle(SCAN_IPC.dismiss, (event, id: string) => { assertSender(event); return jobs.dismiss(id); });
  ipcMain.handle(SCAN_IPC.cancel, (event, id?: string) => { assertSender(event); if (id) return jobs.cancel(id); scanner.cancel(); });
  ipcMain.handle(SCAN_IPC.openSourceFolder, async (event, jobId: string) => {
    assertSender(event);
    if (typeof jobId !== 'string') throw new Error('Invalid scan identifier.');
    const error = await shell.openPath(scanner.sourceFolder(jobId));
    if (error) throw new Error('Could not open the source folder.');
  });
  return () => {
    jobs.close();
    for (const channel of Object.values(SCAN_IPC)) ipcMain.removeHandler(channel);
  };
};
