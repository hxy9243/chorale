import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  LocalDocumentStore,
  PluginError,
  ViewSnapshotStore,
  createServer,
  createToolHandlers,
  createViewBridge,
  measureBodies,
  remoteToolHandlers,
} from '../server.mjs';

test('reads only written ABC measures', () => {
  assert.deepEqual(measureBodies('X:1\nT:Test\nK:C\nC D | E F | G A |'), ['C D', 'E F', 'G A']);
});

test('captures a selection for a specific connected view', () => {
  const views = new ViewSnapshotStore();
  views.update('plugin-main', {
    documentId: 'waltz',
    title: 'Waltz in G minor',
    revision: 4,
    selection: { startMeasure: 1, endMeasure: 8, voiceId: '1' },
    selectedAbc: 'X:1\nK:Gm\nV:1\nd3/2 c/ B |',
  });
  assert.deepEqual(views.require('plugin-main').selection, { startMeasure: 1, endMeasure: 8, voiceId: '1' });
  assert.equal(views.require('plugin-main').selectedAbc, 'X:1\nK:Gm\nV:1\nd3/2 c/ B |');
  assert.throws(() => views.update('bad/view', { documentId: 'waltz', revision: 1, selection: null }), (error) => error instanceof PluginError && error.code === 'INVALID_VIEW');
});

test('resolves the focused live view and warns when multiple views are connected', () => {
  let now = 1_000;
  const views = new ViewSnapshotStore({ now: () => now });
  views.update('background-view', {
    documentId: 'first', revision: 1, selection: null, focused: false, visibilityState: 'visible',
  });
  now += 100;
  views.update('focused-view', {
    documentId: 'second', revision: 1, selection: null, focused: true, visibilityState: 'visible',
  });

  const resolved = views.resolve();
  assert.equal(resolved.viewId, 'focused-view');
  assert.match(resolved.warning, /Multiple Chorale views are connected/);

  now += 6_001;
  assert.throws(() => views.resolve(), (error) => error instanceof PluginError && error.code === 'VIEW_NOT_CONNECTED');
});

test('read_measure_selection is a fast read and fails immediately when no view is connected', async () => {
  let openCount = 0;
  const views = new ViewSnapshotStore({
    openUi: async () => {
      openCount += 1;
      return true;
    },
  });
  const result = await createToolHandlers(new LocalDocumentStore(), views).read_measure_selection({});
  assert.equal(openCount, 0);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.errorCode, 'VIEW_NOT_CONNECTED');
});

test('read_measure_selection returns success with null selection when view has empty selection', async () => {
  const views = new ViewSnapshotStore();
  views.update('view-empty', {
    documentId: 'fugue',
    title: 'Fugue in C Major',
    revision: 2,
    selection: null,
    focused: true,
    visibilityState: 'visible',
  });
  const result = await createToolHandlers(new LocalDocumentStore(), views).read_measure_selection({ viewId: 'view-empty' });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.documentId, 'fugue');
  assert.equal(result.structuredContent.title, 'Fugue in C Major');
  assert.equal(result.structuredContent.selection, null);
  assert.equal(result.structuredContent.selectedAbc, null);
  assert.match(result.structuredContent.message, /no measures are currently selected/);
});

test('read_measure_range returns SELECTION_MISMATCH when view selection differs from requested range', async () => {
  const views = new ViewSnapshotStore();
  views.update('view-mismatch', {
    documentId: 'fugue',
    title: 'Fugue',
    revision: 1,
    selection: { startMeasure: 1, endMeasure: 2 },
    selectedAbc: 'C D | E F |',
  });
  const handlers = createToolHandlers(new LocalDocumentStore(), views);
  const result = await handlers.read_measure_range({ viewId: 'view-mismatch', startMeasure: 3, endMeasure: 4 });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.errorCode, 'SELECTION_MISMATCH');
});

test('open_chorale_ui launches UI and sets active document', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-open-'));
  const store = new LocalDocumentStore(join(directory, 'scores.json'));
  const doc = await store.create({ title: 'Toccata', abcSource: 'X:1\nK:C\nC |' });
  let openedDocId = null;
  const views = new ViewSnapshotStore({
    openUi: async (docId) => {
      openedDocId = docId;
      return true;
    },
  });
  const handlers = createToolHandlers(store, views);
  const result = await handlers.open_chorale_ui({ documentId: doc.id });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.opened, true);
  assert.equal(result.structuredContent.documentId, doc.id);
  assert.equal(openedDocId, doc.id);
  const ws = await store.getWorkspace();
  assert.equal(ws.activeFileId, doc.id);
});

test('get_active_view and get_workspace_state report current UI and workspace status', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-active-'));
  const store = new LocalDocumentStore(join(directory, 'scores.json'));
  const doc = await store.create({ title: 'Invention', abcSource: 'X:1\nK:C\nC D |' });
  await store.patchWorkspace({ kind: 'active', value: doc.id });
  const views = new ViewSnapshotStore();
  views.update('view-main', {
    documentId: doc.id,
    title: 'Invention',
    revision: 1,
    activeTab: 'abc-editor',
    isEditorVisible: true,
    selection: { startMeasure: 1, endMeasure: 1 },
    selectedAbc: 'C D |',
    focused: true,
    visibilityState: 'visible',
  });
  const handlers = createToolHandlers(store, views);
  const activeViewResult = await handlers.get_active_view({ viewId: 'view-main' });
  assert.equal(activeViewResult.isError, undefined);
  assert.equal(activeViewResult.structuredContent.documentId, doc.id);
  assert.equal(activeViewResult.structuredContent.activeTab, 'abc-editor');
  assert.equal(activeViewResult.structuredContent.isEditorVisible, true);
  assert.deepEqual(activeViewResult.structuredContent.selection, { startMeasure: 1, endMeasure: 1 });

  const wsResult = await handlers.get_workspace_state();
  assert.equal(wsResult.isError, undefined);
  assert.equal(wsResult.structuredContent.activeFileId, doc.id);
  assert.equal(wsResult.structuredContent.documentCount, 1);
  assert.equal(wsResult.structuredContent.connectedViewsCount, 1);
  assert.equal(wsResult.structuredContent.activeView.documentId, doc.id);
});

test('queues bridge commands and notifies views', () => {
  const views = new ViewSnapshotStore();
  views.update('plugin-main', { documentId: 'waltz', title: 'Waltz', revision: 1, selection: null });
  const command = views.enqueue('plugin-main', { kind: 'annotations', documentId: 'waltz', expectedRevision: 1, annotations: [] });
  assert.equal(views.pending('plugin-main').length, 1);
  views.acknowledge('plugin-main', command.id);
  assert.equal(views.pending('plugin-main').length, 0);

  views.notifyViews('waltz', { kind: 'replace-score', replacementAbc: 'X:1\nK:C\nC |' });
  assert.equal(views.pending('plugin-main').length, 1);
});

test('persists score edits and manages revisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-plugin-'));
  const store = new LocalDocumentStore(join(directory, 'scores.json'));
  const document = await store.create({ title: 'Minuet', abcSource: 'X:1\nK:C\nC D | E F |' });
  assert.equal(document.revision, 1);

  // Edit score
  const { document: edited, summary } = await store.editScore({
    documentId: document.id,
    expectedRevision: 1,
    replacementAbc: 'X:1\nK:C\nC D | E F | G A |',
    summary: 'Add two measures',
  });
  assert.equal(edited.revision, 2);
  assert.equal(summary, 'Add two measures');
  assert.equal(edited.abcSource, 'X:1\nK:C\nC D | E F | G A |');

  // Rejects stale revision
  await assert.rejects(
    () => store.editScore({
      documentId: document.id,
      expectedRevision: 1,
      replacementAbc: 'X:1\nK:C\nC |',
      summary: 'Stale update',
    }),
    (error) => error instanceof PluginError && error.code === 'REVISION_CONFLICT',
  );
});

test('adds, edits, and deletes annotations with revision tracking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-plugin-'));
  const store = new LocalDocumentStore(join(directory, 'scores.json'));
  const document = await store.create({ title: 'Test', abcSource: 'X:1\nK:C\nC D | E F | G A |' });

  // Add annotations
  const { document: docWithAnns, annotations: added } = await store.addAnnotations({
    documentId: document.id,
    expectedRevision: 1,
    annotations: [
      { startMeasure: 1, endMeasure: 2, label: 'Motif', body: 'Opening gesture' },
      { startMeasure: 3, endMeasure: 3, label: 'Cadence', body: 'Resolution' },
    ],
  });
  assert.equal(docWithAnns.revision, 2);
  assert.equal(added.length, 2);

  // Edit annotation
  const { document: docEditedAnn, annotation: updatedAnn } = await store.editAnnotations({
    documentId: document.id,
    expectedRevision: 2,
    annotationId: added[0].id,
    updates: { label: 'Primary Motif', body: 'Modified explanation' },
  });
  assert.equal(docEditedAnn.revision, 3);
  assert.equal(updatedAnn.label, 'Primary Motif');
  assert.equal(updatedAnn.body, 'Modified explanation');

  // Delete annotation
  const { document: docDeleted, deletedCount } = await store.deleteAnnotations({
    documentId: document.id,
    expectedRevision: 3,
    annotationIds: [added[1].id],
  });
  assert.equal(docDeleted.revision, 4);
  assert.equal(deletedCount, 1);
  assert.equal(docDeleted.annotations.length, 1);
});

test('MCP server exposes all requested score inspection and edit tools', () => {
  const store = new LocalDocumentStore();
  const views = new ViewSnapshotStore();
  const server = createServer(store, views);
  assert.ok(server);
});

test('same-origin daemon workspace is shared and revision guarded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-workspace-'));
  const bridge = createViewBridge(new ViewSnapshotStore(), new LocalDocumentStore(join(directory, 'scores.json')));
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  try {
    const port = bridge.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const first = await fetch(`${baseUrl}/v1/workspace`).then((response) => response.json());
    assert.equal(first.revision, 0);
    const document = { id: 'shared-score', name: 'Shared.abc', abcSource: 'X:1\nK:C\nC |', revision: 1, annotations: [] };
    const saved = await fetch(`${baseUrl}/v1/workspace`, {
      method: 'PUT', headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ documents: [document], activeFileId: document.id, preferences: { 'chorale.workspace.sheetZoom': 120 }, expectedRevision: 0 }),
    }).then((response) => response.json());
    assert.equal(saved.revision, 1);
    const reread = await fetch(`${baseUrl}/v1/workspace`).then((response) => response.json());
    assert.deepEqual(reread.documents, [document]);
    assert.equal(reread.activeFileId, document.id);
    await Promise.all([
      fetch(`${baseUrl}/v1/workspace/preferences/chorale.workspace.sheetZoom`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 125 }) }),
      fetch(`${baseUrl}/v1/workspace/preferences/chorale.workspace.editorVisible`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: true }) }),
    ]);
    const concurrent = await fetch(`${baseUrl}/v1/workspace`).then((response) => response.json());
    assert.equal(concurrent.preferences['chorale.workspace.sheetZoom'], 125);
    assert.equal(concurrent.preferences['chorale.workspace.editorVisible'], true);
  } finally {
    bridge.closeAllConnections();
    await new Promise((resolve, reject) => bridge.close((error) => error ? reject(error) : resolve()));
  }
});

test('stdio proxy preserves structured daemon tool errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-errors-'));
  const bridge = createViewBridge(new ViewSnapshotStore(), new LocalDocumentStore(join(directory, 'scores.json')));
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  try {
    const handlers = remoteToolHandlers(`http://127.0.0.1:${bridge.address().port}`);
    const result = await handlers.read_measure_selection({ viewId: 'missing-view' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.errorCode, 'VIEW_NOT_CONNECTED');
    assert.match(result.content[0].text, /missing-view is not connected/);
  } finally {
    bridge.closeAllConnections();
    await new Promise((resolve, reject) => bridge.close((error) => error ? reject(error) : resolve()));
  }
});
