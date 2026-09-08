import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalDocumentStore, PluginError, ViewSnapshotStore, createServer, measureBodies } from '../server.mjs';

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
