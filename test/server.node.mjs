import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalDocumentStore, PluginError, ViewSnapshotStore, measureBodies } from '../server.mjs';

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

test('queues bridge commands until the Chorale page acknowledges them', () => {
  const views = new ViewSnapshotStore();
  views.update('plugin-main', { documentId: 'waltz', title: 'Waltz', revision: 1, selection: null });
  const command = views.enqueue('plugin-main', { kind: 'annotations', documentId: 'waltz', expectedRevision: 1, annotations: [] });
  assert.equal(views.pending('plugin-main').length, 1);
  views.acknowledge('plugin-main', command.id);
  assert.equal(views.pending('plugin-main').length, 0);
});

test('persists annotations and rejects stale revisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chorale-plugin-'));
  const store = new LocalDocumentStore(join(directory, 'scores.json'));
  const document = await store.create({ title: 'Test', abcSource: 'X:1\nK:C\nC D | E F |' });
  const { document: annotated } = await store.addAnnotation({ documentId: document.id, expectedRevision: 1, startMeasure: 1, endMeasure: 2, label: 'Phrase', body: 'A two-bar idea.' });
  assert.equal(annotated.revision, 2);
  await assert.rejects(() => store.addAnnotation({ documentId: document.id, expectedRevision: 1, startMeasure: 1, endMeasure: 1, label: 'Stale', body: 'No.' }), (error) => error instanceof PluginError && error.code === 'REVISION_CONFLICT');
  assert.equal((await store.require(document.id)).annotations.length, 1);
});
