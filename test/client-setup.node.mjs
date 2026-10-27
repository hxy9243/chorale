import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { planClientSetup, applyClientSetup, setupClientsInteractively, hasConfiguredClient } from '../server/client-setup.mjs';

test('client setup previews, requires confirmation, preserves settings and backs up privately', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-client-setup-'));
  try {
    const options = { home, client: 'claude-desktop', platform: 'linux', entrypoint: '/Chorale with spaces/bin/chorale.mjs', environment: {} };
    let plan = await planClientSetup(options);
    await mkdir(dirname(plan.destination), { recursive: true });
    const original = JSON.stringify({ theme: 'dark', mcpServers: { existing: { command: 'existing' } } });
    await writeFile(plan.destination, original);
    plan = await planClientSetup(options);
    assert.match(plan.summary, /Chorale with spaces/);
    assert.equal((await applyClientSetup(plan)).status, 'cancelled');
    assert.equal((await applyClientSetup(plan, { confirm: async () => false })).status, 'cancelled');
    assert.equal(await readFile(plan.destination, 'utf8'), original);
    const result = await applyClientSetup(plan, { confirm: async () => true });
    const config = JSON.parse(await readFile(plan.destination, 'utf8'));
    assert.equal(config.theme, 'dark');
    assert.equal(config.mcpServers.existing.command, 'existing');
    assert.deepEqual(config.mcpServers.chorale.args, [options.entrypoint, 'mcp']);
    assert.equal(await readFile(result.backup, 'utf8'), original);
    assert.equal((await stat(result.backup)).mode & 0o777, 0o600);
    assert.equal((await applyClientSetup(await planClientSetup(options))).status, 'unchanged');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('malformed or concurrently edited client configuration is never overwritten', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-client-race-'));
  try {
    const options = { home, client: 'antigravity', environment: {} };
    let plan = await planClientSetup(options);
    assert.equal(plan.destination, join(home, '.gemini/config/mcp_config.json'));
    await mkdir(dirname(plan.destination), { recursive: true });
    await writeFile(plan.destination, '{broken');
    await assert.rejects(planClientSetup(options), /not valid JSON/);
    assert.equal(await readFile(plan.destination, 'utf8'), '{broken');
    await writeFile(plan.destination, '{}');
    plan = await planClientSetup(options);
    await writeFile(plan.destination, '{"changed":true}');
    await assert.rejects(applyClientSetup(plan, { confirm: async () => true }), /configuration changed/);
    assert.equal(await readFile(plan.destination, 'utf8'), '{"changed":true}');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('noninteractive setup never writes; ChatGPT returns honest HTTPS guidance', async () => {
  const logger = { log() {}, error() {} };
  const result = await setupClientsInteractively({ input: { isTTY: false }, output: { isTTY: false }, logger });
  assert.equal(result.status, 'cancelled');
  const plan = await planClientSetup({ client: 'chatgpt' });
  assert.equal(plan.kind, 'manual'); assert.match(plan.summary, /HTTPS/);
  assert.equal((await applyClientSetup(plan, { confirm: () => assert.fail('not an automatic ChatGPT registration') })).status, 'manual');
});

test('Codex uses its supported CLI with absolute stdio arguments only after approval', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-codex-setup-'));
  try {
    const command = join(home, 'codex');
    await writeFile(command, '', { mode: 0o755 });
    const plan = await planClientSetup({ client: 'codex', home, environment: { PATH: home }, entrypoint: '/opt/chorale/bin/chorale.mjs' });
    assert.equal(plan.kind, 'command');
    let called = false;
    const execCommand = async (file, args) => { called = true; assert.equal(file, command); assert.deepEqual(args.slice(-3), [process.execPath, '/opt/chorale/bin/chorale.mjs', 'mcp']); };
    await applyClientSetup(plan, { confirm: async () => false, execCommand });
    assert.equal(called, false);
    await applyClientSetup(plan, { confirm: async () => true, execCommand });
    assert.equal(called, true);
  } finally { await rm(home, { recursive: true, force: true }); }
});


test('existing JSON and CLI MCP registrations suppress the first-run offer', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-client-detect-'));
  const options = { home, platform: 'linux', environment: {} };
  try {
    assert.equal(await hasConfiguredClient(options), false);
    const plan = await planClientSetup({ ...options, client: 'claude-desktop' });
    await mkdir(dirname(plan.destination), { recursive: true });
    await writeFile(plan.destination, '{broken');
    assert.equal(await hasConfiguredClient(options), false);
    await writeFile(plan.destination, JSON.stringify({ mcpServers: { chorale: { command: 'chorale', args: ['mcp'] } } }));
    assert.equal(await hasConfiguredClient(options), true);
    await rm(plan.destination);
    await writeFile(join(home, 'codex'), '', { mode: 0o755 });
    const cliOptions = { ...options, environment: { PATH: home } };
    assert.equal(await hasConfiguredClient({ ...cliOptions, execCommand: async (command, args) => {
      assert.equal(command, join(home, 'codex'));
      assert.deepEqual(args, ['mcp', 'get', 'chorale']);
      return { stdout: 'Registered Chorale MCP server' };
    } }), true);
    assert.equal(await hasConfiguredClient({ ...cliOptions, execCommand: async () => { throw new Error('No such server'); } }), false);
  } finally { await rm(home, { recursive: true, force: true }); }
});
