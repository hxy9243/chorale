import { app, dialog, shell, type BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLIENTS, planClientSetup, applyClientSetup, type ClientId } from '../server/client-setup.mjs';

let showing = false;

export async function showClientSetup(window: BrowserWindow, projectDirectory: string) {
  if (showing || window.isDestroyed()) return;
  showing = true;
  try {
    const clients = Object.keys(CLIENTS) as ClientId[];
    const choice = await dialog.showMessageBox(window, {
      type: 'question', title: 'Connect an AI app',
      message: 'Which app would you like to connect to Chorale?',
      detail: 'You will review and confirm the connection before any settings change.',
      buttons: [...clients.map(client => CLIENTS[client]), 'Not now'],
      defaultId: clients.length, cancelId: clients.length, noLink: true,
    });
    const client = clients[choice.response];
    if (!client) return;
    const plan = await planClientSetup({ client, entrypoint: path.join(projectDirectory, 'bin/chorale.mjs') });
    if (plan.kind === 'manual') {
      const result = await dialog.showMessageBox(window, {
        type: 'info', title: `Connect ${plan.label}`, message: `Connect ${plan.label}`,
        detail: plan.summary, buttons: plan.url ? ['View setup guide', 'Close'] : ['Close'],
        defaultId: plan.url ? 1 : 0, cancelId: plan.url ? 1 : 0,
      });
      if (plan.url && result.response === 0) await shell.openExternal(plan.url);
      return;
    }
    const result = await applyClientSetup(plan, { confirm: async () => {
      const choice = await dialog.showMessageBox(window, {
        type: 'question', title: `Connect ${plan.label}`, message: `Allow ${plan.label} to use Chorale?`,
        detail: plan.summary, buttons: ['Connect', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
      });
      return choice.response === 0;
    } });
    if (result.status !== 'cancelled') await dialog.showMessageBox(window, {
      type: 'info', title: 'Chorale connection', message: result.message,
    });
  } catch (error) {
    await dialog.showMessageBox(window, { type: 'error', title: 'Connection setup',
      message: error instanceof Error ? error.message : 'Could not connect the app.' });
  } finally { showing = false; }
}

export async function offerClientSetup(window: BrowserWindow, projectDirectory: string) {
  if (process.env.CHORALE_SKIP_CLIENT_SETUP === '1') return;
  const marker = path.join(app.getPath('userData'), 'client-setup-offered.json');
  try { if (JSON.parse(await readFile(marker, 'utf8')).offered === true) return; } catch { /* First launch. */ }
  const choice = await dialog.showMessageBox(window, {
    type: 'question', title: 'Welcome to Chorale', message: 'Connect your AI apps?',
    detail: 'Use Chorale scores from Claude, Antigravity or Codex. Each connection asks for your confirmation. You can do this later from the Chorale menu.',
    buttons: ['Choose an app', 'Not now'], defaultId: 1, cancelId: 1, noLink: true,
  });
  await writeFile(marker, JSON.stringify({ offered: true }), { mode: 0o600 });
  if (choice.response === 0) await showClientSetup(window, projectDirectory);
}
