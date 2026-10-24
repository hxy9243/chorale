import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { LocalDocumentStore } from '../server/store.mjs';
import { startServer } from '../server/api_server.mjs';

test('Streamable HTTP, SSE and REST share the same library and revision guards', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-http-mcp-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  const running = await startServer({ port: 0, store });
  const base = `http://127.0.0.1:${running.port}`;
  const client = new Client({ name: 'http-smoke', version: '1' });
  const legacy = new Client({ name: 'sse-smoke', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    assert.ok((await client.listTools()).tools.some(tool => tool.name === 'read_measure'));
    const created = await client.callTool({ name: 'create_new_file', arguments: {
      title: 'HTTP score', abcSource: 'X:1\nT:HTTP score\nM:4/4\nL:1/4\nK:C\nC D E F |]',
    } });
    assert.ok(!created.isError, JSON.stringify(created));
    const id = created.structuredContent.documentId;
    const score = await (await fetch(`${base}/v1/scores/${id}`)).json();
    assert.equal(score.title, 'HTTP score');
    const preserved = await fetch(`${base}/v1/workspace/documents`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documents: [], baseRevisions: {} }) });
    assert.equal(preserved.status, 200);
    assert.equal((await (await fetch(`${base}/v1/scores/${id}`)).json()).title, 'HTTP score', 'A stale desktop save cannot delete an unseen MCP score');
    await legacy.connect(new SSEClientTransport(new URL(`${base}/sse`)));
    const files = await legacy.callTool({ name: 'list_files', arguments: {} });
    assert.ok(JSON.stringify(files).includes(id));
    const stale = await client.callTool({ name: 'edit_measures', arguments: {
      documentId: id, startMeasure: 1, endMeasure: 1, expectedRevision: score.revision + 1,
      replacementAbc: 'F E D C |]',
    } });
    assert.equal(stale.isError, true);
    assert.equal(stale.structuredContent.errorCode, 'REVISION_CONFLICT');
    assert.equal((await (await fetch(`${base}/v1/scores/${id}`)).json()).abcSource, score.abcSource);
    assert.equal((await fetch(`${base}/mcp`, { headers: { origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'invalid' })).status, 400);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(2_000_001) })).status, 413);
  } finally {
    await client.close(); await legacy.close();
    running.httpServer.closeAllConnections();
    await new Promise(resolve => running.httpServer.close(resolve));
    await running.mcpServer.close(); store.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('web and desktop JSON content persists in SQLite across service restarts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-sqlite-content-'));
  let store;
  let running;
  const stop = async () => {
    if (running) {
      running.httpServer.closeAllConnections();
      await new Promise(resolve => running.httpServer.close(resolve));
      await running.mcpServer.close();
      running = null;
    }
    store?.close();
    store = null;
  };
  try {
    store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
    const score = await store.create({ title: 'Shared score', abcSource: 'X:1\nK:C\nC4|' });
    running = await startServer({ port: 0, store });
    let base = `http://127.0.0.1:${running.port}`;
    const path = '/v1/storage/chorale.pi-agent-conversation.v4';
    const conversation = { version: 4, files: { [score.id]: { threads: [{ messages: ['Shared conversation'], pendingMessages: ['Follow up'] }] } } };
    const write = (key, value) => fetch(`${base}/v1/storage/${key}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }),
    });
    assert.deepEqual(await (await fetch(`${base}${path}`)).json(), { found: false });
    assert.equal((await write('chorale.pi-agent-conversation.v4', conversation)).status, 200);
    assert.deepEqual(await (await fetch(`${base}${path}`)).json(), { found: true, value: conversation });
    assert.equal((await store.require(score.id)).revision, score.revision, 'Saving chat must not rewrite score revisions');
    await write('schema_version', 'untrusted content');
    assert.equal(store.getMeta('schema_version'), '1', 'JSON storage cannot alter the schema version');
    assert.equal((await write('nullable', null)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/v1/storage/nullable`)).json(), { found: true, value: null });
    const invalid = await fetch(`${base}${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400);
    assert.equal((await fetch(`${base}${path}`, { headers: { origin: 'https://untrusted.invalid' } })).status, 403);
    const staleWrite = await fetch(`${base}${path}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: { files: {} }, baseline: { found: false } }),
    });
    assert.equal(staleWrite.status, 409, 'A stale browser or desktop save must not overwrite shared conversations');
    assert.deepEqual(await (await fetch(`${base}${path}`)).json(), { found: true, value: conversation });
    await stop();

    store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
    running = await startServer({ port: 0, store });
    base = `http://127.0.0.1:${running.port}`;
    assert.deepEqual(await (await fetch(`${base}${path}`)).json(), { found: true, value: conversation });
    assert.equal((await (await fetch(`${base}/v1/workspace`)).json()).documents[0].id, score.id);
    assert.equal((await fetch(`${base}${path}`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(await (await fetch(`${base}${path}`)).json(), { found: false });
  } finally {
    await stop();
    await rm(home, { recursive: true, force: true });
  }
});
