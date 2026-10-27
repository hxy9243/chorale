// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
const mocks = vi.hoisted(() => ({
  home: '', showMessageBox: vi.fn(), openExternal: vi.fn(), plan: vi.fn(), apply: vi.fn(), configured: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => mocks.home }, dialog: { showMessageBox: mocks.showMessageBox }, shell: { openExternal: mocks.openExternal },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler),
    removeHandler: (channel: string) => mocks.handlers.delete(channel) },
}));
vi.mock('../../../server/client-setup.mjs', () => ({
  CLIENTS: { 'claude-desktop': 'Claude Desktop', codex: 'Codex', chatgpt: 'ChatGPT' },
  CHATGPT_SETUP_URL: 'https://developers.openai.com/plugins/build/app-quickstart',
  hasConfiguredClient: mocks.configured, planClientSetup: mocks.plan, applyClientSetup: mocks.apply,
}));
import { offerClientSetup, registerClientSetupIPC } from '../../../electron/clientSetup';
import { MCP_IPC } from '../../../electron/ipcChannels';
const frame = { url: 'app://chorale/index.html' };
const webContents = { mainFrame: frame };
const window = { isDestroyed: () => false, webContents } as unknown as BrowserWindow;
const event = { sender: webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
const invoke = (channel: string, ...args: unknown[]) => mocks.handlers.get(channel)!(event, ...args);

describe('MCP integration setup', () => {
  beforeEach(async () => {
    vi.resetAllMocks(); mocks.handlers.clear();
    mocks.home = await mkdtemp(path.join(tmpdir(), 'chorale-mcp-offer-'));
    mocks.configured.mockResolvedValue(false);
    vi.stubEnv('CHORALE_SKIP_CLIENT_SETUP', '0');
  });
  afterEach(async () => { await rm(mocks.home, { recursive: true, force: true }); vi.unstubAllEnvs(); });

  it('offers MCP setup only once after declining and tells the renderer to show the settings reminder', async () => {
    mocks.showMessageBox.mockImplementation(async () => {
      expect(JSON.parse(await readFile(path.join(mocks.home, 'client-setup-offered.json'), 'utf8')).offered).toBe(true);
      return { response: 1 };
    });
    expect(await offerClientSetup(window)).toBe('declined');
    expect(await offerClientSetup(window)).toBe('none');
    expect(mocks.showMessageBox).toHaveBeenCalledOnce();
    expect(mocks.showMessageBox.mock.calls[0][1]).toMatchObject({ title: 'MCP integration', buttons: ['Open settings', 'Not now'] });
    expect(mocks.showMessageBox.mock.calls[0][1].detail).toContain('Settings → Integration');
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it('accepting opens settings without running setup in another popup', async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    expect(await offerClientSetup(window)).toBe('open-settings');
    expect(mocks.showMessageBox).toHaveBeenCalledOnce();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('does not prompt a configured user or a profile with an existing offered marker', async () => {
    mocks.configured.mockResolvedValue(true);
    expect(await offerClientSetup(window)).toBe('none');
    mocks.configured.mockResolvedValue(false);
    await writeFile(path.join(mocks.home, 'client-setup-offered.json'), '{"offered":true}');
    expect(await offerClientSetup(window)).toBe('none');
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent offers from the renderer', async () => {
    registerClientSetupIPC(() => window, '/opt/chorale');
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    expect(await Promise.all([invoke(MCP_IPC.offerSetup), invoke(MCP_IPC.offerSetup)])).toEqual(['open-settings', 'open-settings']);
    expect(mocks.showMessageBox).toHaveBeenCalledOnce();
  });
  it('only applies the exact preview retained in the main process after confirmation', async () => {
    const dispose = registerClientSetupIPC(() => window, '/opt/chorale');
    const plan = { client: 'claude-desktop', label: 'Claude Desktop', kind: 'json', summary: 'Review this connection', previous: 'PRIVATE CONFIG' };
    mocks.plan.mockResolvedValue(plan);
    mocks.apply.mockImplementation(async (received, options) => {
      expect(received).toBe(plan); expect(await options.confirm()).toBe(true);
      return { status: 'connected', message: 'Connected' };
    });
    const preview = await invoke(MCP_IPC.preview, 'claude-desktop') as { id: string };
    expect(preview).not.toHaveProperty('previous');
    expect(mocks.apply).not.toHaveBeenCalled();
    await expect(invoke(MCP_IPC.connect, 'forged')).rejects.toThrow('Review');
    expect(await invoke(MCP_IPC.connect, preview.id)).toMatchObject({ status: 'connected' });
    await expect(invoke(MCP_IPC.connect, preview.id)).rejects.toThrow('Review');
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    dispose(); expect(mocks.handlers.size).toBe(0);
  });
  it('rejects untrusted senders and invalid clients; the guide has a fixed URL', async () => {
    registerClientSetupIPC(() => window, '/opt/chorale');
    await expect(mocks.handlers.get(MCP_IPC.openGuide)!({ sender: {} })).rejects.toThrow('Untrusted');
    await expect(invoke(MCP_IPC.preview, '__proto__')).rejects.toThrow('Choose');
    await invoke(MCP_IPC.openGuide);
    expect(mocks.openExternal).toHaveBeenCalledWith('https://developers.openai.com/plugins/build/app-quickstart');
  });
});
