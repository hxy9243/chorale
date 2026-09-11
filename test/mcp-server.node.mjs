import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMcpServer } from '../mcp/index.mjs';
import { startServer } from '../mcp/server.mjs';
import { LocalDocumentStore, PluginError } from '../mcp/store.mjs';
import { createFileManagementTools } from '../mcp/tools/file-management.mjs';
import { createSheetManagementTools } from '../mcp/tools/sheet-management.mjs';
import {
  deleteMeasures,
  insertMeasures,
  measureBodies,
  replaceMeasures,
  sliceMeasureRange,
  splitHeadersAndBody,
} from '../mcp/utils/measure-ops.mjs';
import { ViewSnapshotStore } from '../mcp/views.mjs';

const sampleAbc = `X:1
T:Minuet in G
C:J.S. Bach
M:3/4
L:1/8
K:G
V:1
d2 G A B c | d2 G2 G2 | e2 c d e f | g2 G2 G2 |
V:2
[G,B,D]3 | [G,B,D]3 | [C,E,G]3 | [G,B,D]3 |`;

test('measure-ops: splits headers and body accurately', () => {
  const { headers, body } = splitHeadersAndBody(sampleAbc);
  assert.match(headers, /^X:1/);
  assert.match(headers, /K:G/);
  assert.match(body, /d2 G A B c/);
});

test('measure-ops: measures extraction and counting', () => {
  const measures = measureBodies(sampleAbc);
  assert.equal(measures.length >= 4, true);
});

test('measure-ops: sliceMeasureRange returns bounded measures for voices', () => {
  const sliced = sliceMeasureRange(sampleAbc, 1, 2);
  assert.equal(sliced.measureCount, 2);
  assert.match(sliced.selectedAbc, /d2 G A B c/);
  assert.match(sliced.selectedAbc, /\[G,B,D\]3/);
});

test('measure-ops: insertMeasures adds bars before or after', () => {
  const inserted = insertMeasures(sampleAbc, 2, 'after', 1, 'c2 d2 e2 |');
  const measures = measureBodies(inserted);
  assert.equal(measures.length > measureBodies(sampleAbc).length, true);
});

test('measure-ops: replaceMeasures updates target range', () => {
  const replaced = replaceMeasures(sampleAbc, 1, 1, 'A2 B2 C2 |');
  assert.match(replaced, /A2 B2 C2/);
});

test('measure-ops: deleteMeasures removes target range', () => {
  const deleted = deleteMeasures(sampleAbc, 1, 1);
  const beforeCount = measureBodies(sampleAbc).length;
  const afterCount = measureBodies(deleted).length;
  assert.equal(afterCount < beforeCount, true);
});

test('store: LocalDocumentStore file operations in custom directory', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-test-store-'));
  try {
    const store = new LocalDocumentStore({ baseDir: tempDir });
    const doc = await store.create({
      title: 'Test Score',
      abcSource: sampleAbc,
    });

    assert.equal(doc.title, 'Test Score');
    assert.equal(doc.revision, 1);

    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, doc.id);

    const updated = await store.update(doc.id, {
      title: 'Updated Score',
      expectedRevision: 1,
    });
    assert.equal(updated.title, 'Updated Score');
    assert.equal(updated.revision, 2);

    // Concurrency check
    await assert.rejects(
      () => store.update(doc.id, { title: 'Conflict', expectedRevision: 1 }),
      (err) => err instanceof PluginError && err.code === 'REVISION_CONFLICT',
    );

    const deleted = await store.delete(doc.id);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.remainingCount, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('views: ViewSnapshotStore resolves active view and tracks commands', () => {
  const views = new ViewSnapshotStore();
  views.update('view-1', {
    documentId: 'score-1',
    title: 'Sonata',
    focused: true,
    selection: { startMeasure: 1, endMeasure: 4 },
  });

  const resolved = views.resolve();
  assert.equal(resolved.viewId, 'view-1');
  assert.equal(resolved.selection.startMeasure, 1);

  views.queueCommand('view-1', { type: 'HIGHLIGHT_RANGE', startMeasure: 2 });
  const pending = views.pending('view-1');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].type, 'HIGHLIGHT_RANGE');

  views.acknowledge('view-1', pending[0].id);
  assert.equal(views.pending('view-1').length, 0);
});

test('file tools: create_new_file, list_files, delete_file, export_file', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-test-file-tools-'));
  try {
    const store = new LocalDocumentStore({ baseDir: tempDir });
    const { handlers } = createFileManagementTools(store);

    const createRes = await handlers.create_new_file({
      title: 'Invention No. 1',
      abcSource: sampleAbc,
    });
    assert.equal(createRes.isError, undefined);
    const docId = createRes.structuredContent.documentId;

    const listRes = await handlers.list_files();
    assert.equal(listRes.structuredContent.count, 1);

    const exportRes = await handlers.export_file({
      documentId: docId,
      format: 'abc',
    });
    assert.equal(exportRes.isError, undefined);
    assert.match(exportRes.structuredContent.content, /Minuet in G/);

    const deleteRes = await handlers.delete_file({ documentId: docId });
    assert.equal(deleteRes.structuredContent.remainingCount, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('sheet tools: read, insert, edit, delete measures and notations', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-test-sheet-tools-'));
  try {
    const store = new LocalDocumentStore({ baseDir: tempDir });
    const views = new ViewSnapshotStore();
    const doc = await store.create({
      title: 'Prelude',
      abcSource: sampleAbc,
    });

    const { handlers } = createSheetManagementTools(store, views);

    // Read measure
    const readRes = await handlers.read_measure({
      documentId: doc.id,
      startMeasure: 1,
      endMeasure: 2,
    });
    assert.equal(readRes.isError, undefined);
    assert.equal(readRes.structuredContent.measureCount, 2);

    // Add notation
    const addNotRes = await handlers.add_notation({
      documentId: doc.id,
      expectedRevision: 1,
      notations: [{
        startMeasure: 1,
        endMeasure: 1,
        label: 'Tonic',
        chordSymbol: 'G',
        romanNumeral: 'I',
      }],
    });
    assert.equal(addNotRes.isError, undefined);
    assert.equal(addNotRes.structuredContent.addedCount, 1);
    const notationId = addNotRes.structuredContent.annotations[0].id;

    // List notations
    const listNotRes = await handlers.list_notations({ documentId: doc.id });
    assert.equal(listNotRes.structuredContent.count, 1);

    // Edit notation
    const editNotRes = await handlers.edit_notations({
      documentId: doc.id,
      expectedRevision: 2,
      notationId,
      updates: { chordSymbol: 'Gmaj' },
    });
    assert.equal(editNotRes.isError, undefined);
    assert.equal(editNotRes.structuredContent.notation.chordSymbol, 'Gmaj');

    // Delete notation
    const delNotRes = await handlers.delete_notations({
      documentId: doc.id,
      expectedRevision: 3,
      notationIds: [notationId],
    });
    assert.equal(delNotRes.structuredContent.deletedCount, 1);

    // Edit measure
    const editMeasureRes = await handlers.edit_measure({
      documentId: doc.id,
      startMeasure: 1,
      endMeasure: 1,
      replacementAbc: 'c2 d2 e2 f2 |',
      expectedRevision: 4,
    });
    assert.equal(editMeasureRes.isError, undefined);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('server: starts HTTP server, serves /v1/health, REST tools, and files', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-test-http-'));
  let runningServer;
  try {
    const store = new LocalDocumentStore({ baseDir: tempDir });
    const views = new ViewSnapshotStore();
    runningServer = await startServer({
      port: 0, // dynamic port for testing
      store,
      views,
    });

    const port = runningServer.port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/v1/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.service, 'chorale-service');
    assert.equal(healthJson.status, 'ok');

    // 2. Direct REST tool call: create_new_file
    const createToolRes = await fetch(`${baseUrl}/v1/tools/create_new_file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'HTTP Created Score', abcSource: sampleAbc }),
    });
    assert.equal(createToolRes.status, 200);
    const createToolJson = await createToolRes.json();
    assert.equal(createToolJson.structuredContent.title, 'HTTP Created Score');

    // 2b. Direct REST tool call: edit_score
    const editScoreRes = await fetch(`${baseUrl}/v1/tools/edit_score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: createToolJson.structuredContent.documentId,
        replacementAbc: sampleAbc.replace('Minuet in G', 'Expanded Minuet'),
      }),
    });
    assert.equal(editScoreRes.status, 200);

    // 2c. View commands endpoint
    views.update('view-test-1', { documentId: createToolJson.structuredContent.documentId });
    const postCmdRes = await fetch(`${baseUrl}/v1/views/view-test-1/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'replace-score', replacementAbc: sampleAbc }),
    });
    assert.equal(postCmdRes.status, 200);
    const pendingCmds = views.pending('view-test-1');
    assert.equal(pendingCmds.length >= 1, true);

    // 3. Workspace API
    const wsRes = await fetch(`${baseUrl}/v1/workspace`);
    assert.equal(wsRes.status, 200);
    const wsJson = await wsRes.json();
    assert.equal(wsJson.documents.length, 1);

    // 4. Files listing
    const filesRes = await fetch(`${baseUrl}/v1/files`);
    assert.equal(filesRes.status, 200);
    const filesJson = await filesRes.json();
    assert.equal(filesJson.files.length, 1);

    // 5. Fallback HTML page
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.match(htmlText, /Chorale/);
  } finally {
    if (runningServer?.httpServer) {
      await new Promise((resolve) => runningServer.httpServer.close(resolve));
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
