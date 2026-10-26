import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify, isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';

export const CLIENTS = {
  'claude-desktop': 'Claude Desktop', 'claude-code': 'Claude Code',
  antigravity: 'Antigravity', codex: 'Codex', chatgpt: 'ChatGPT',
};
export const CHATGPT_SETUP_URL = 'https://developers.openai.com/plugins/build/app-quickstart';
const readOptional = async (path) => {
  try { return await readFile(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

async function executable(name, environment, platform) {
  for (const folder of (environment.PATH || '').split(delimiter)) {
    if (!folder) continue;
    const path = join(folder, platform === 'win32' ? `${name}.exe` : name);
    try { await access(path, constants.X_OK); return path; } catch { /* Try the next PATH entry. */ }
  }
  return null;
}

export async function planClientSetup(options = {}) {
  const { client } = options;
  if (!Object.hasOwn(CLIENTS, client)) throw new Error(`Choose one of: ${Object.keys(CLIENTS).join(', ')}.`);
  const environment = options.environment || process.env;
  const home = options.home || homedir();
  const platform = options.platform || process.platform;
  const label = CLIENTS[client];
  if (client === 'chatgpt') return {
    client, label, kind: 'manual', url: CHATGPT_SETUP_URL,
    summary: 'ChatGPT connects from the cloud and needs an HTTPS MCP URL. Chorale stays on this computer at http://127.0.0.1:1685/mcp. Configure an authenticated HTTPS deployment or relay, then add its /mcp URL in ChatGPT Plugins. No public access or account changes are enabled here.',
  };
  const entrypoint = resolve(options.entrypoint || join(import.meta.dirname, '../bin/chorale.mjs'));
  const node = options.nodeExecutable || environment.CHORALE_NODE_EXECUTABLE || process.execPath;
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  for (const key of ['CHORALE_HOME', 'CHORALE_PORT']) if (environment[key]) env[key] = environment[key];
  const connection = { command: node, args: [entrypoint, 'mcp'], env };
  const permission = 'This lets the app read and edit scores in your Chorale library. Other connections and settings are preserved.';

  if (client === 'codex' || client === 'claude-code') {
    const command = await executable(client === 'codex' ? 'codex' : 'claude', environment, platform);
    if (!command) return { client, label, kind: 'manual', summary: `Install the ${label} CLI and make it available in PATH, then run chorale setup mcp ${client}. No configuration was changed.` };
    const args = client === 'codex' ? ['mcp', 'add', 'chorale'] : ['mcp', 'add', '--scope', 'user', '--transport', 'stdio', 'chorale'];
    for (const [key, value] of Object.entries(env)) args.push('--env', `${key}=${value}`);
    args.push('--', node, entrypoint, 'mcp');
    return { client, label, kind: 'command', command, args,
      summary: `${permission}\n\nRegister the Chorale connection using ${label}'s own CLI:\n${JSON.stringify([command, ...args])}` };
  }
  let destination;
  if (client === 'claude-desktop') {
    const folder = platform === 'darwin' ? join(home, 'Library/Application Support/Claude')
      : platform === 'win32' ? join(environment.APPDATA || join(home, 'AppData/Roaming'), 'Claude')
        : join(environment.XDG_CONFIG_HOME || join(home, '.config'), 'Claude');
    destination = join(folder, 'claude_desktop_config.json');
  } else {
    destination = join(home, '.gemini/config/mcp_config.json');
    if (await readOptional(destination) === null) {
      const legacy = join(home, '.gemini/antigravity/mcp_config.json');
      if (await readOptional(legacy) !== null) destination = legacy;
    }
  }
  const previous = await readOptional(destination);
  let config;
  try { config = previous === null ? {} : JSON.parse(previous); } catch {
    throw new Error(`${destination} is not valid JSON. It was left unchanged.`);
  }
  if (!object(config) || (config.mcpServers !== undefined && !object(config.mcpServers))) {
    throw new Error(`${destination} has an unsupported structure. It was left unchanged.`);
  }
  const alreadyConnected = isDeepStrictEqual(config.mcpServers?.chorale, connection);
  const action = config.mcpServers?.chorale ? 'Replace only the existing Chorale connection' : 'Add a Chorale connection';
  return { client, label, kind: 'json', destination, previous, alreadyConnected,
    content: JSON.stringify({ ...config, mcpServers: { ...config.mcpServers, chorale: connection } }, null, 2) + '\n',
    summary: `${permission}\n\n${action} in:\n${destination}\n\nNew connection:\n${JSON.stringify(connection, null, 2)}` };
}

/** Read existing registrations without changing any client configuration. */
export async function hasConfiguredClient(options = {}) {
  const environment = options.environment || process.env;
  const platform = options.platform || process.platform;
  for (const client of ['claude-desktop', 'antigravity']) {
    try {
      const plan = await planClientSetup({ ...options, client });
      if (object(JSON.parse(plan.previous || '{}').mcpServers?.chorale)) return true;
    } catch { /* A malformed client config must not prevent opening Chorale. */ }
  }
  for (const name of ['codex', 'claude']) {
    const command = await executable(name, environment, platform);
    if (!command) continue;
    try {
      await (options.execCommand || promisify(execFile))(command, ['mcp', 'get', 'chorale'], {
        env: environment, timeout: 3000, windowsHide: true,
      });
      return true;
    } catch { /* Missing registration or unavailable CLI. */ }
  }
  return false;
}

/** Confirmation is required at this boundary, including calls from native UI. */
export async function applyClientSetup(plan, options = {}) {
  if (plan.kind === 'manual') return { status: 'manual', message: plan.summary };
  if (plan.alreadyConnected) return { status: 'unchanged', message: `${plan.label} is already connected.` };
  if (!options.confirm || !await options.confirm(plan)) return { status: 'cancelled', message: 'No connection settings were changed.' };
  if (plan.kind === 'command') {
    try {
      await (options.execCommand || promisify(execFile))(plan.command, plan.args, {
        env: options.environment || process.env, timeout: 15000, windowsHide: true,
      });
    } catch { throw new Error(`Could not register Chorale with ${plan.label}. Check that app's MCP settings; other apps were not changed.`); }
    return { status: 'connected', message: `Chorale is registered with ${plan.label}. Restart the app or reload its MCP connections.` };
  }
  if (await readOptional(plan.destination) !== plan.previous) throw new Error('The configuration changed while you were reviewing it. Run setup again; nothing was written.');
  await mkdir(dirname(plan.destination), { recursive: true });
  let backup;
  if (plan.previous !== null) {
    backup = `${plan.destination}.chorale-backup-${randomUUID()}`;
    await writeFile(backup, plan.previous, { mode: 0o600, flag: 'wx' });
  }
  const temporary = `${plan.destination}.chorale-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, plan.content, { mode: 0o600, flag: 'wx' });
    if (await readOptional(plan.destination) !== plan.previous) throw new Error('The configuration changed during setup. Nothing was overwritten; run setup again.');
    await rename(temporary, plan.destination);
  } finally { await rm(temporary, { force: true }); }
  return { status: 'connected', backup, message: `Chorale is registered with ${plan.label}. Restart the app or reload its MCP connections.` };
}

export async function setupClientsInteractively(options = {}) {
  const logger = options.logger || console;
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  let terminal;
  const question = options.question || (async (text) => {
    terminal ||= createInterface({ input, output });
    return terminal.question(text);
  });
  try {
    if (!options.question && (!input.isTTY || !output.isTTY)) {
      logger.log('Client setup needs an interactive terminal so you can review and confirm changes. Run chorale setup mcp in your terminal.');
      return { statusCode: 1, status: 'cancelled' };
    }
    let client = options.client;
    if (!client) {
      logger.log(Object.entries(CLIENTS).map(([id, label]) => `${id}: ${label}`).join('\n'));
      client = (await question('Connect which app? (Enter to cancel) ')).trim();
      if (!client) return { statusCode: 0, status: 'cancelled' };
    }
    const plan = await planClientSetup({ ...options, client });
    logger.log(plan.summary);
    const result = await applyClientSetup(plan, { ...options, confirm: async () => (
      /^y(es)?$/i.test((await question(`Connect Chorale to ${plan.label}? [y/N] `)).trim())
    ) });
    logger.log(result.message);
    if (plan.url) logger.log(plan.url);
    return { statusCode: 0, ...result };
  } catch (error) {
    logger.error(error.message);
    return { statusCode: 1, error: error.message };
  } finally { terminal?.close(); }
}
