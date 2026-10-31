import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { LocalDocumentStore } from '../server/store.mjs';
import { ViewSnapshotStore } from '../server/views.mjs';
import { startServer } from '../server/api_server.mjs';
import { createSheetManagementTools } from '../server/mcp/tools/sheet-management.mjs';
import { extractMusicXmlString, musicXmlToAbc } from '../server/utils/music-xml.mjs';

const abc = 'X:1\nT:Stored score\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]';
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><work><work-title>XML regression</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure></part></score-partwise>`;

test('selected reads use stored score text, reject stale selections, and cannot borrow another score selection', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-selection-regression-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  try {
    const doc = await store.create({ title: 'Stored score', abcSource: abc });
    const other = await store.create({ title: 'Other score', abcSource: abc.replace('C D E F', 'F E D C') });
    const views = new ViewSnapshotStore();
    views.update('view-one', { documentId: doc.id, revision: doc.revision,
      selection: { startMeasure: 2, endMeasure: 2 }, selectedAbc: 'UNSAVED OR WRONG SCORE', focused: true });
    const { handlers } = createSheetManagementTools(store, views, {
      analyzeHarmony: async () => ({ slices: [] }), analyzeMusic21: async input => ({ range: {
        startMeasure: input.startMeasure, endMeasure: input.endMeasure,
      } }),
    });
    const selected = await handlers.read_measure({ viewId: 'view-one' });
    assert.equal(selected.isError, undefined);
    assert.match(selected.structuredContent.abcSource, /G A B c/);
    assert.doesNotMatch(selected.structuredContent.abcSource, /UNSAVED/);
    for (const name of ['read_measure', 'analyze_harmony', 'analyze_music21']) {
      const different = await handlers[name]({ documentId: other.id, viewId: 'view-one', code: 'result=1' });
      assert.equal(different.isError, undefined, name);
      assert.equal(different.structuredContent.range.startMeasure, 1, name);
    }
    await store.update(doc.id, { abcSource: abc.replace('C D E F', 'D E F G'), expectedRevision: doc.revision });
    for (const name of ['read_measure', 'analyze_harmony', 'analyze_music21']) {
      const stale = await handlers[name]({ documentId: doc.id, viewId: 'view-one', code: 'result=1' });
      assert.equal(stale.isError, true, name);
      assert.equal(stale.structuredContent.errorCode, 'REVISION_CONFLICT', name);
      const explicit = await handlers[name]({ documentId: doc.id, viewId: 'view-one', startMeasure: 1, code: 'result=1' });
      assert.equal(explicit.isError, undefined, name);
      assert.equal(explicit.structuredContent.range.startMeasure, 1, name);
    }
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});

test('HTTP MCP retains exact chord positions and rejects edits that the renderer would discard', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-notation-regression-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  const running = await startServer({ port: 0, store });
  const client = new Client({ name: 'notation-regression', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`)));
    const doc = await store.create({ title: 'Onsets', abcSource: abc });
    const call = (name, args) => client.callTool({ name, arguments: { documentId: doc.id, ...args } });
    const position = { measure: 1, offset: { numerator: 1, denominator: 2 } };
    const added = await call('add_notation', { expectedRevision: 1, notations: [{ startMeasure: 1, label: 'Later onset', chordSymbol: 'C', position }] });
    assert.ok(!added.isError, JSON.stringify(added));
    assert.deepEqual(added.structuredContent.annotations[0].position, position);
    const notationId = added.structuredContent.annotations[0].id;
    const moved = await call('edit_notations', { expectedRevision: 2, notationId, updates: { startMeasure: 2, endMeasure: 2 } });
    assert.ok(!moved.isError, JSON.stringify(moved));
    assert.deepEqual(moved.structuredContent.notation.position, { ...position, measure: 2 });
    const retimed = await call('edit_notations', { expectedRevision: 3, notationId, updates: {
      position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
    } });
    assert.ok(!retimed.isError, JSON.stringify(retimed));
    assert.deepEqual(retimed.structuredContent.notation.position.offset, { numerator: 1, denominator: 4 });
    for (const updates of [{ chordSymbol: '' }, { label: ' ' }, { position: { measure: 1, offset: { numerator: 0, denominator: 1 } } }]) {
      const invalid = await call('edit_notations', { expectedRevision: 4, notationId, updates });
      assert.equal(invalid.isError, true, JSON.stringify(updates));
      assert.equal((await store.require(doc.id)).revision, 4);
    }
    const pickup = await call('add_notation', { expectedRevision: 4, notations: [{ startMeasure: 0, label: 'Pickup' }] });
    assert.equal(pickup.isError, true, 'Saved annotation spans start at m. 1; do not claim to save a discarded pickup');
    assert.equal((await store.require(doc.id)).revision, 4);
  } finally {
    await client.close(); running.httpServer.closeAllConnections();
    await new Promise(resolve => running.httpServer.close(resolve));
    await running.mcpServer.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});

test('MusicXML conversion works in Node, returns ABC text, and restores browser globals', async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const result = await musicXmlToAbc(xml);
  assert.match(result, /^X:/m);
  assert.match(result, /XML regression/);
  assert.doesNotMatch(result, /\[object Object\]/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), before);
  const hostWindow = { preserved: true };
  Object.defineProperty(globalThis, 'window', { value: hostWindow, configurable: true, enumerable: true });
  const hostDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    await musicXmlToAbc(xml);
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), hostDescriptor);
    await assert.rejects(musicXmlToAbc('<score-partwise/>'));
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), hostDescriptor);
  } finally {
    if (before) Object.defineProperty(globalThis, 'window', before);
    else delete globalThis.window;
  }
  assert.equal(await extractMusicXmlString(new TextEncoder().encode(xml)), xml);
  await assert.rejects(musicXmlToAbc('<not-a-score/>'));
  await assert.rejects(musicXmlToAbc(xml.replace('</score-partwise>', '')), /unclosed tag/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), before);
});

test('HTTP MCP imports plain and compressed MusicXML using explicit format hints', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-xml-regression-'));
  const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
  const running = await startServer({ port: 0, store });
  const client = new Client({ name: 'xml-regression', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`)));
    const broken = await client.callTool({ name: 'import_file', arguments: {
      content: xml.replace('</score-partwise>', ''), format: 'musicxml',
    } });
    assert.equal(broken.isError, true);
    assert.equal((await store.list()).length, 0, 'Malformed XML must not create a partial score');
    const zip = new JSZip(); zip.file('score.musicxml', xml);
    zip.file('META-INF/container.xml', "<container><rootfiles><rootfile full-path='score.musicxml'/></rootfiles></container>");
    const filePath = join(home, 'compressed-score.data');
    await writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
    const xmlPath = join(home, 'score-partwise.xml');
    await writeFile(xmlPath, xml);
    for (const args of [{ content: xml, format: 'musicxml' }, { filePath, format: 'mxl' }, { filePath: xmlPath }]) {
      const imported = await client.callTool({ name: 'import_file', arguments: args });
      assert.ok(!imported.isError, JSON.stringify(imported));
      assert.equal(imported.structuredContent.measureCount, 1);
      assert.match((await store.require(imported.structuredContent.documentId)).abcSource, /^X:/m);
    }
    const abcPath = join(home, 'abc-with-misleading-extension.xml');
    await writeFile(abcPath, abc);
    const forcedAbc = await client.callTool({ name: 'import_file', arguments: { filePath: abcPath, format: 'abc' } });
    assert.ok(!forcedAbc.isError, JSON.stringify(forcedAbc));
    assert.equal((await store.require(forcedAbc.structuredContent.documentId)).abcSource, abc);
  } finally {
    await client.close(); running.httpServer.closeAllConnections();
    await new Promise(resolve => running.httpServer.close(resolve));
    await running.mcpServer.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});

test('stdio forwards to the daemon without creating a second library', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chorale-stdio-library-'));
  const bridgeHome = join(home, 'bridge');
  const store = new LocalDocumentStore({ baseDir: join(home, 'daemon'), seedDefault: false });
  const doc = await store.create({ title: 'Daemon score', abcSource: abc });
  const running = await startServer({ port: 0, store });
  const client = new Client({ name: 'stdio-regression', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('bin/chorale.mjs'), 'mcp'],
      env: { ...process.env, CHORALE_HOME: bridgeHome, CHORALE_PORT: String(running.port) }, stderr: 'pipe' }));
    const files = await client.callTool({ name: 'list_files', arguments: {} });
    assert.equal(files.structuredContent.files[0].documentId, doc.id);
    assert.equal(existsSync(join(bridgeHome, 'chorale.db')), false, 'stdio must not initialize a separate SQLite library');
  } finally {
    await client.close(); running.httpServer.closeAllConnections();
    await new Promise(resolve => running.httpServer.close(resolve));
    await running.mcpServer.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});
