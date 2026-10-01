import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startServer } from '../server/api_server.mjs';
import { proxyDaemonTools } from '../server/daemon-mutations.mjs';
import { MUSIC21_REQUIREMENT, resolveMusic21Python, runProcess } from '../server/music21.mjs';
import { LocalDocumentStore } from '../server/store.mjs';
import { ViewSnapshotStore } from '../server/views.mjs';
import { HARMONY_REGRESSION_FIXTURES } from './fixtures/harmony-regression.mjs';

const literalSlice = (slice) => ({
  position: slice.position,
  durationQuarterLength: slice.durationQuarterLength,
  soundingPitches: slice.soundingPitches,
  literalBass: slice.literalBass,
});

test('harmony regression: exact frozen evidence through real HTTP and stdio daemon transport', async (t) => {
  try {
    const runtime = await resolveMusic21Python();
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') assert.equal(runtime.version, MUSIC21_REQUIREMENT.split('==')[1]);
  } catch (error) {
    if (process.env.CHORALE_REQUIRE_MUSIC21 === '1') throw error;
    t.skip('music21 is not installed in the optional-dependency test environment');
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-test-regression-'));
  let server;
  let store;
  try {
    store = new LocalDocumentStore({ baseDir: tempDir });
    const views = new ViewSnapshotStore();
    server = await startServer({ port: 0, store, views, seedDefault: false });
    const stdioProxy = proxyDaemonTools({ analyze_harmony() {} }, server.port);

    for (const fixture of HARMONY_REGRESSION_FIXTURES) {
      await t.test(fixture.title, async () => {
        const doc = await store.create({ title: fixture.title, abcSource: fixture.abcSource });
        const initialDoc = await store.require(doc.id);
        const input = { documentId: doc.id, ...fixture.range };
        const response = await fetch(`http://127.0.0.1:${server.port}/v1/tools/analyze_harmony`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        const result = await response.json();
        assert.equal(response.status, 200, `HTTP failure for ${fixture.id}: ${JSON.stringify(result)}`);
        assert.equal(result.isError, undefined, `Failed fixture ${fixture.id}: ${JSON.stringify(result)}`);
        const content = result.structuredContent;
        assert.equal(content.documentId, doc.id);
        assert.equal(content.revision, initialDoc.revision);
        assert.equal(content.schemaVersion, 1);
        assert.equal(content.engine.name, 'music21');
        assert.deepEqual(content.range, fixture.range);
        assert.equal(content.keySource, content.estimatedPassageKey === null ? 'ambiguous' : 'written');
        if (Object.hasOwn(fixture, 'expectedPassageKey')) {
          assert.equal(content.estimatedPassageKey, fixture.expectedPassageKey);
        }

        // Compare the whole literal list, including its exact length and every
        // onset, release duration, pitch and bass. Extra slices cannot pass.
        assert.deepEqual(content.slices.map(literalSlice), fixture.expectedSlices.map((slice) => literalSlice({ ...slice, literalBass: slice.literalBass ?? slice.soundingPitches[0] })), `Literal evidence mismatch for ${fixture.id}`);
        for (const [index, expected] of fixture.expectedSlices.entries()) {
          for (const [field, value] of Object.entries(expected.candidate || {})) {
            assert.equal(content.slices[index].candidate[field], value, `${field} mismatch at slice ${index} for ${fixture.id}`);
          }
        }

        // Exercise the same HTTP proxy used by stdio, rather than only its local handler.
        const proxied = await stdioProxy.analyze_harmony(input);
        assert.deepEqual(proxied, result, `stdio daemon proxy diverged for ${fixture.id}`);
        const currentDoc = await store.require(doc.id);
        assert.equal(currentDoc.revision, initialDoc.revision, 'Analysis must not change revision');
        assert.equal(currentDoc.abcSource, initialDoc.abcSource, 'Analysis must not change ABC');
        assert.deepEqual(currentDoc.annotations || [], [], 'Analysis must not add annotations');
      });
    }
  } finally {
    if (server) {
      server.httpServer.closeAllConnections();
      await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
      await server.mcpServer.close();
    }
    store?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('HTTP score reads work without Python while harmony returns a structured setup error', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'chorale-no-python-'));
  try {
    const result = await runProcess(process.execPath, ['--input-type=module', '-e', `
      import { startServer } from './server/api_server.mjs';
      import { LocalDocumentStore } from './server/store.mjs';
      const store = new LocalDocumentStore({ baseDir: process.env.CHORALE_HOME });
      const doc = await store.create({ title: 'No Python', abcSource: 'X:1\\nM:4/4\\nL:1/4\\nK:C\\nC4 |' });
      const server = await startServer({ port: 0, store, seedDefault: false });
      try {
        const call = async (name) => {
          const response = await fetch('http://127.0.0.1:' + server.port + '/v1/tools/' + name, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ documentId: doc.id, startMeasure: 1, endMeasure: 1 }),
          });
          return { status: response.status, body: await response.json() };
        };
        process.stdout.write(JSON.stringify({ read: await call('read_measure'), analysis: await call('analyze_harmony') }));
      } finally {
        server.httpServer.closeAllConnections();
        await new Promise(resolve => server.httpServer.close(resolve));
        await server.mcpServer.close();
        store.close();
      }
    `], {
      cwd: process.cwd(),
      env: { ...process.env, PATH: tempDir, CHORALE_HOME: tempDir, CHORALE_MUSIC21_PYTHON: join(tempDir, 'missing-python') },
    });
    const output = JSON.parse(result.stdout);
    assert.equal(output.read.status, 200);
    assert.equal(output.read.body.isError, undefined);
    assert.equal(output.analysis.status, 400);
    assert.equal(output.analysis.body.isError, true);
    assert.equal(output.analysis.body.structuredContent.errorCode, 'MUSIC21_UNAVAILABLE');
    assert.match(output.analysis.body.content[0].text, /chorale setup music21/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
