import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pluginRoot = new URL('../', import.meta.url);

test('MCP server launches relative to the installed plugin root', async () => {
  const config = JSON.parse(
    await readFile(new URL('.mcp.json', pluginRoot), 'utf8'),
  );

  assert.deepEqual(config.mcpServers.chorale, {
    command: 'node',
    args: ['./server.mjs'],
    cwd: '.',
  });
});
