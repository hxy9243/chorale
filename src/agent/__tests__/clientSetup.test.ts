// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(), openExternal: vi.fn(), plan: vi.fn(), apply: vi.fn(),
}));
vi.mock('electron', () => ({ app: { getPath: () => '/unused' }, dialog: { showMessageBox: mocks.showMessageBox }, shell: { openExternal: mocks.openExternal } }));
vi.mock('../../../server/client-setup.mjs', () => ({
  CLIENTS: { 'claude-desktop': 'Claude Desktop', 'claude-code': 'Claude Code', antigravity: 'Antigravity', codex: 'Codex', chatgpt: 'ChatGPT' },
  planClientSetup: mocks.plan, applyClientSetup: mocks.apply,
}));
import { showClientSetup } from '../../../electron/clientSetup';
import type { BrowserWindow } from 'electron';
const window = { isDestroyed: () => false } as BrowserWindow;

describe('native client setup confirmation', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('previews the connection and honors cancellation at the write boundary', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 1 });
    mocks.plan.mockResolvedValue({ client: 'claude-desktop', label: 'Claude Desktop', kind: 'json', summary: 'Exact target and connection' });
    mocks.apply.mockImplementation(async (_plan, options) => {
      expect(await options.confirm()).toBe(false);
      return { status: 'cancelled' };
    });
    await showClientSetup(window, '/opt/chorale');
    expect(mocks.plan).toHaveBeenCalledWith({ client: 'claude-desktop', entrypoint: '/opt/chorale/bin/chorale.mjs' });
    expect(mocks.showMessageBox.mock.calls[1][1]).toMatchObject({ detail: 'Exact target and connection', defaultId: 1, cancelId: 1 });
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
  it('returns approval only after the user selects Connect', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 2 }).mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 0 });
    mocks.plan.mockResolvedValue({ client: 'antigravity', label: 'Antigravity', kind: 'json', summary: 'Preview' });
    mocks.apply.mockImplementation(async (_plan, options) => {
      expect(await options.confirm()).toBe(true);
      return { status: 'connected', message: 'Connected' };
    });
    await showClientSetup(window, '/opt/chorale');
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(3);
  });
  it('keeps ChatGPT manual and opens its guide only after an explicit click', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 4 }).mockResolvedValueOnce({ response: 1 });
    mocks.plan.mockResolvedValue({ label: 'ChatGPT', kind: 'manual', summary: 'HTTPS required', url: 'https://developers.openai.com/plugins/build/app-quickstart' });
    await showClientSetup(window, '/opt/chorale');
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});
