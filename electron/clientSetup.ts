import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CLIENTS, CHATGPT_SETUP_URL, hasConfiguredClient, planClientSetup, applyClientSetup, type ClientId, type ClientPlan } from '../server/client-setup.mjs';
import { MCP_IPC } from './ipcChannels';
import { isAllowedRendererUrl } from './ipcValidation';
import type { McpIntegrationBridge } from '../src/types/mcpIntegration';

type SetupOffer = Awaited<ReturnType<McpIntegrationBridge['offerSetup']>>;

export async function offerClientSetup(window: BrowserWindow): Promise<SetupOffer> {
  if (process.env.CHORALE_SKIP_CLIENT_SETUP === '1' || window.isDestroyed()) return 'none';
  const marker = path.join(app.getPath('userData'), 'client-setup-offered.json');
  try { if (JSON.parse(await readFile(marker, 'utf8')).offered === true) return 'none'; } catch { /* First launch. */ }
  if (await hasConfiguredClient()) return 'none';
  await mkdir(path.dirname(marker), { recursive: true });
  await writeFile(marker, JSON.stringify({ offered: true }), { mode: 0o600 });
  const choice = await dialog.showMessageBox(window, {
    type: 'question', title: 'MCP integration', message: 'Set up MCP integration?',
    detail: 'Let Claude, Antigravity or Codex work with your Chorale scores through MCP. You can set this up any time in Settings → Integration.',
    buttons: ['Open settings', 'Not now'], defaultId: 1, cancelId: 1, noLink: true,
  });
  return choice.response === 0 ? 'open-settings' : 'declined';
}

export function registerClientSetupIPC(getWindow: () => BrowserWindow | null, projectDirectory: string) {
  let pending: { id: string; plan: ClientPlan } | null = null;
  let offering: Promise<SetupOffer> | null = null;
  const assertSender = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame || !isAllowedRendererUrl(event.senderFrame.url)) {
      throw new Error('Untrusted MCP integration request.');
    }
    return window;
  };
  ipcMain.handle(MCP_IPC.offerSetup, (event) => {
    const window = assertSender(event);
    offering ??= offerClientSetup(window).finally(() => { offering = null; });
    return offering;
  });
  ipcMain.handle(MCP_IPC.preview, async (event, client: unknown) => {
    assertSender(event);
    pending = null;
    if (typeof client !== 'string' || !Object.hasOwn(CLIENTS, client)) throw new Error('Choose an MCP application.');
    const plan = await planClientSetup({ client: client as ClientId, entrypoint: path.join(projectDirectory, 'bin/chorale.mjs') });
    const id = randomUUID();
    pending = { id, plan };
    return { id, label: plan.label, kind: plan.kind, summary: plan.summary,
      alreadyConnected: plan.alreadyConnected, hasGuide: Boolean(plan.url) };
  });
  ipcMain.handle(MCP_IPC.connect, async (event, previewId: unknown) => {
    assertSender(event);
    if (!pending || typeof previewId !== 'string' || pending.id !== previewId) throw new Error('Review the MCP connection again before connecting.');
    const { plan } = pending;
    pending = null;
    // The Connect button confirms this exact main-process preview.
    return applyClientSetup(plan, { confirm: async () => true });
  });
  ipcMain.handle(MCP_IPC.openGuide, async (event) => {
    assertSender(event);
    await shell.openExternal(CHATGPT_SETUP_URL);
  });
  return () => {
    pending = null;
    for (const channel of [MCP_IPC.offerSetup, MCP_IPC.preview, MCP_IPC.connect, MCP_IPC.openGuide]) ipcMain.removeHandler(channel);
  };
}
