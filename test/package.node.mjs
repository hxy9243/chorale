import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginRoot = new URL('../', import.meta.url);

test('MCP server uses the plugin-local runtime launcher', async () => {
  const config = JSON.parse(
    await readFile(new URL('.mcp.json', pluginRoot), 'utf8'),
  );

  assert.deepEqual(config.mcpServers.chorale, {
    command: './scripts/launch_chorale_mcp',
    args: [],
    cwd: '.',
    env_vars: [
      'CODEX_MCP_NODE_PATH',
      'CODEX_BROWSER_USE_NODE_PATH',
      'CODEX_ELECTRON_RESOURCES_PATH',
      'CODEX_CLI_PATH',
      'XDG_CACHE_HOME',
      'HOME',
      'USERPROFILE',
      'LOCALAPPDATA',
      'PATH',
    ],
  });

  await access(new URL('scripts/launch_chorale_mcp', pluginRoot), constants.X_OK);
});

test('packaged MCP launcher initializes from an unrelated working directory', async () => {
  const packagedRoot = new URL('../plugins/chorale-codex-plugin/', import.meta.url);
  const launcher = new URL('scripts/launch_chorale_mcp', packagedRoot);
  const child = spawn(fileURLToPath(launcher), [], {
    cwd: '/tmp',
    env: {
      HOME: process.env.HOME,
      CODEX_MCP_NODE_PATH: process.execPath,
      CHORALE_PLUGIN_BRIDGE_PORT: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const output = [];
  const errors = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => errors.push(chunk));
  child.stdin.end(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'package-test', version: '1' },
    },
  })}\n`);

  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MCP initialize timed out')), 5_000);
    child.stdout.once('data', (chunk) => {
      clearTimeout(timeout);
      resolve(JSON.parse(chunk.toString()));
    });
    child.once('exit', (code) => {
      if (code !== null && output.length === 0) {
        clearTimeout(timeout);
        reject(new Error(`MCP launcher exited ${code}: ${Buffer.concat(errors).toString()}`));
      }
    });
  });

  child.kill();
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, 'Chorale');
});

test('local marketplace installs the bounded package from the durable checkout', async () => {
  const marketplace = JSON.parse(
    await readFile(new URL('.agents/plugins/marketplace.json', pluginRoot), 'utf8'),
  );

  assert.equal(marketplace.name, 'chorale-local');
  assert.deepEqual(marketplace.plugins.map(({ name, source }) => ({ name, source })), [
    {
      name: 'chorale-codex-plugin',
      source: { source: 'local', path: './plugins/chorale-codex-plugin' },
    },
  ]);
});

test('bounded runtime package mirrors the authoritative root declarations', async () => {
  const files = [
    '.mcp.json',
    '.codex-plugin/plugin.json',
    'scripts/launch_chorale_mcp',
    'skills/chorale-score/SKILL.md',
  ];

  for (const file of files) {
    assert.equal(
      await readFile(new URL(`plugins/chorale-codex-plugin/${file}`, pluginRoot), 'utf8'),
      await readFile(new URL(file, pluginRoot), 'utf8'),
      `${file} must be synchronized into the bounded runtime package`,
    );
  }

  assert.match(
    await readFile(new URL('plugins/chorale-codex-plugin/server.mjs', pluginRoot), 'utf8'),
    /ui:\/\/chorale\/workspace-v1\.html/,
  );
  assert.equal(
    await readFile(new URL('plugins/chorale-codex-plugin/dist/index.html', pluginRoot), 'utf8')
      .then((html) => html.includes('<div id="root"></div>')),
    true,
  );
});
