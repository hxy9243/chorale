import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = resolve(__dirname, 'dist');

const WORKSPACE_URI = 'ui://chorale/workspace-v1.html';
const MAX_ABC_BYTES = 2_000_000;
const MAX_VIEW_SNAPSHOT_BYTES = 2_000_000;
const DEFAULT_BRIDGE_PORT = 43171;
const defaultStorePath = resolve(homedir(), '.chorale', 'codex-plugin-store.json');

export class PluginError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const measureBodies = (abcSource) => {
  const body = abcSource
    .split(/\r?\n/)
    .filter((line) => !/^[A-Za-z]:/.test(line.trim()))
    .join('\n');
  return body.split('|').map((part) => part.replace(/[[\]]/g, '').trim()).filter(Boolean);
};

export const scoreSummary = (document) => ({
  documentId: document.id,
  title: document.title,
  revision: document.revision,
  measureCount: measureBodies(document.abcSource).length,
  annotationCount: document.annotations.length,
  updatedAt: document.updatedAt,
});

export class LocalDocumentStore {
  constructor(storePath = process.env.CHORALE_PLUGIN_STORE || defaultStorePath, views = null) {
    this.storePath = resolve(storePath);
    this.views = views;
  }

  setViews(views) {
    this.views = views;
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.storePath, 'utf8'));
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.documents)) {
        throw new PluginError('PERSISTENCE_FAILED', 'The local Chorale store has an unsupported format.');
      }
      return parsed;
    } catch (error) {
      if (error && error.code === 'ENOENT') return { schemaVersion: 1, documents: [] };
      if (error instanceof PluginError) throw error;
      throw new PluginError('PERSISTENCE_FAILED', 'The local Chorale store could not be read.');
    }
  }

  async write(state) {
    await mkdir(dirname(this.storePath), { recursive: true });
    const temporaryPath = `${this.storePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    await rename(temporaryPath, this.storePath);
  }

  async list() {
    return (await this.read()).documents;
  }

  async upsertFromSnapshot(snap) {
    const state = await this.read();
    let doc = state.documents.find((d) => d.id === snap.documentId);
    if (!doc) {
      const now = new Date().toISOString();
      doc = {
        id: snap.documentId,
        title: snap.title || 'Untitled score',
        abcSource: snap.abcSource || snap.selectedAbc || 'X:1\nK:C\nC |',
        revision: snap.revision || 1,
        annotations: [],
        createdAt: now,
        updatedAt: now,
      };
      state.documents.push(doc);
      await this.write(state);
    }
    return doc;
  }

  async require(documentId) {
    const document = (await this.list()).find((candidate) => candidate.id === documentId);
    if (!document && this.views) {
      const snap = this.views.get('plugin-main')?.documentId === documentId
        ? this.views.get('plugin-main')
        : [...this.views.views.values()].find((v) => v.documentId === documentId);
      if (snap) return this.upsertFromSnapshot(snap);
    }
    if (!document) throw new PluginError('DOCUMENT_NOT_FOUND', `Score ${documentId} was not found.`);
    return document;
  }

  async create({ title, abcSource }) {
    if (new TextEncoder().encode(abcSource).byteLength > MAX_ABC_BYTES) {
      throw new PluginError('INVALID_SCORE', 'ABC source exceeds the 2 MB prototype limit.');
    }
    if (measureBodies(abcSource).length === 0) {
      throw new PluginError('INVALID_SCORE', 'ABC source does not contain a written measure.');
    }
    const state = await this.read();
    const now = new Date().toISOString();
    const document = {
      id: `score-${randomUUID()}`,
      title: title.trim() || 'Untitled score',
      abcSource,
      revision: 1,
      annotations: [],
      createdAt: now,
      updatedAt: now,
    };
    state.documents.push(document);
    await this.write(state);
    return document;
  }

  async editScore({ documentId, expectedRevision, replacementAbc, summary = '' }) {
    if (new TextEncoder().encode(replacementAbc).byteLength > MAX_ABC_BYTES) {
      throw new PluginError('INVALID_SCORE', 'ABC source exceeds the 2 MB prototype limit.');
    }
    if (measureBodies(replacementAbc).length === 0) {
      throw new PluginError('INVALID_SCORE', 'ABC source does not contain a written measure.');
    }
    const state = await this.read();
    let index = state.documents.findIndex((doc) => doc.id === documentId);
    if (index === -1 && this.views) {
      await this.require(documentId);
      return this.editScore({ documentId, expectedRevision, replacementAbc, summary });
    }
    if (index === -1) throw new PluginError('DOCUMENT_NOT_FOUND', `Score ${documentId} was not found.`);
    const document = state.documents[index];
    if (document.revision !== expectedRevision) {
      throw new PluginError('REVISION_CONFLICT', `Score is at revision ${document.revision}, not ${expectedRevision}.`);
    }
    const now = new Date().toISOString();
    document.abcSource = replacementAbc;
    document.revision += 1;
    document.updatedAt = now;
    await this.write(state);
    return { document, summary };
  }

  async addAnnotations({ documentId, expectedRevision, annotations }) {
    const state = await this.read();
    let index = state.documents.findIndex((doc) => doc.id === documentId);
    if (index === -1 && this.views) {
      await this.require(documentId);
      return this.addAnnotations({ documentId, expectedRevision, annotations });
    }
    if (index === -1) throw new PluginError('DOCUMENT_NOT_FOUND', `Score ${documentId} was not found.`);
    const document = state.documents[index];
    if (document.revision !== expectedRevision) {
      throw new PluginError('REVISION_CONFLICT', `Score is at revision ${document.revision}, not ${expectedRevision}.`);
    }
    const measureCount = measureBodies(document.abcSource).length;
    const now = new Date().toISOString();
    const added = [];
    for (const ann of annotations) {
      const startMeasure = ann.startMeasure ?? ann.span?.startMeasure;
      const endMeasure = ann.endMeasure ?? ann.span?.endMeasure;
      if (!Number.isInteger(startMeasure) || !Number.isInteger(endMeasure) || startMeasure < 1 || endMeasure < startMeasure || endMeasure > measureCount) {
        throw new PluginError('INVALID_RANGE', `Choose measures within 1–${measureCount}.`);
      }
      const kind = ann.kind || (ann.chordSymbol ? 'chord' : 'explanation');
      const item = {
        id: `annotation-${randomUUID()}`,
        span: { startMeasure, endMeasure },
        label: (ann.label || ann.chordSymbol || '').trim(),
        body: (ann.body || ann.text || '').trim(),
        source: 'assistant',
        kind,
        ...(kind === 'chord' ? {
          position: ann.position || { measure: startMeasure, offset: { numerator: 0, denominator: 1 } },
          chordSymbol: (ann.chordSymbol || ann.label || '').trim(),
          ...(ann.romanNumeral ? { romanNumeral: ann.romanNumeral.trim() } : {}),
        } : {}),
        createdAt: now,
        updatedAt: now,
      };
      document.annotations.push(item);
      added.push(item);
    }
    document.revision += 1;
    document.updatedAt = now;
    await this.write(state);
    return { document, annotations: added };
  }

  async addAnnotation({ documentId, expectedRevision, startMeasure, endMeasure, label, body }) {
    const { document, annotations } = await this.addAnnotations({
      documentId,
      expectedRevision,
      annotations: [{ startMeasure, endMeasure, label, body }],
    });
    return { document, annotation: annotations[0] };
  }

  async editAnnotations({ documentId, expectedRevision, annotationId, updates }) {
    const state = await this.read();
    const index = state.documents.findIndex((doc) => doc.id === documentId);
    if (index === -1) throw new PluginError('DOCUMENT_NOT_FOUND', `Score ${documentId} was not found.`);
    const document = state.documents[index];
    if (document.revision !== expectedRevision) {
      throw new PluginError('REVISION_CONFLICT', `Score is at revision ${document.revision}, not ${expectedRevision}.`);
    }
    const target = document.annotations.find((a) => a.id === annotationId);
    if (!target) throw new PluginError('ANNOTATION_NOT_FOUND', `Annotation ${annotationId} was not found.`);
    const measureCount = measureBodies(document.abcSource).length;
    if (updates.startMeasure !== undefined || updates.endMeasure !== undefined) {
      const start = updates.startMeasure ?? target.span.startMeasure;
      const end = updates.endMeasure ?? target.span.endMeasure;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > measureCount) {
        throw new PluginError('INVALID_RANGE', `Choose measures within 1–${measureCount}.`);
      }
      target.span = { startMeasure: start, endMeasure: end };
    }
    if (updates.label !== undefined) target.label = updates.label.trim();
    if (updates.body !== undefined) target.body = updates.body.trim();
    if (updates.text !== undefined) target.body = updates.text.trim();
    const now = new Date().toISOString();
    target.updatedAt = now;
    document.revision += 1;
    document.updatedAt = now;
    await this.write(state);
    return { document, annotation: target };
  }

  async deleteAnnotations({ documentId, expectedRevision, annotationIds }) {
    const state = await this.read();
    const index = state.documents.findIndex((doc) => doc.id === documentId);
    if (index === -1) throw new PluginError('DOCUMENT_NOT_FOUND', `Score ${documentId} was not found.`);
    const document = state.documents[index];
    if (document.revision !== expectedRevision) {
      throw new PluginError('REVISION_CONFLICT', `Score is at revision ${document.revision}, not ${expectedRevision}.`);
    }
    const idSet = new Set(annotationIds);
    const initialLen = document.annotations.length;
    document.annotations = document.annotations.filter((a) => !idSet.has(a.id));
    const deletedCount = initialLen - document.annotations.length;
    const now = new Date().toISOString();
    document.revision += 1;
    document.updatedAt = now;
    await this.write(state);
    return { document, deletedCount };
  }
}

/**
 * Ephemeral state published by a locally running plugin page. This is only a
 * view/context bridge: durable score mutations remain in the document store.
 */
export class ViewSnapshotStore {
  constructor() {
    this.views = new Map();
    this.commands = new Map();
    this.commandAcks = new Map();
  }

  update(viewId, snapshot) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(viewId)) {
      throw new PluginError('INVALID_VIEW', 'View IDs may contain only letters, numbers, dots, underscores, and hyphens.');
    }
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.documentId !== 'string' || !snapshot.documentId) {
      throw new PluginError('INVALID_VIEW', 'A valid view snapshot requires a document ID.');
    }
    if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
      throw new PluginError('INVALID_VIEW', 'A valid view snapshot requires a positive integer revision.');
    }
    const selection = snapshot.selection;
    if (selection !== null && selection !== undefined) {
      if (!Number.isInteger(selection.startMeasure) || !Number.isInteger(selection.endMeasure)
        || selection.startMeasure < 1 || selection.endMeasure < selection.startMeasure) {
        throw new PluginError('INVALID_RANGE', 'A view selection must be an inclusive written-measure range.');
      }
    }
    if (snapshot.selectedAbc !== undefined && typeof snapshot.selectedAbc !== 'string') {
      throw new PluginError('INVALID_VIEW', 'Selected ABC must be text.');
    }
    const stored = Object.freeze({
      documentId: snapshot.documentId,
      title: typeof snapshot.title === 'string' ? snapshot.title : 'Untitled score',
      revision: snapshot.revision,
      selection: selection ? Object.freeze({
        startMeasure: selection.startMeasure,
        endMeasure: selection.endMeasure,
        ...(typeof selection.voiceId === 'string' ? { voiceId: selection.voiceId } : {}),
      }) : null,
      selectedAbc: typeof snapshot.selectedAbc === 'string' ? snapshot.selectedAbc : undefined,
      abcSource: typeof snapshot.abcSource === 'string' ? snapshot.abcSource : undefined,
      updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : new Date().toISOString(),
    });
    this.views.set(viewId, stored);
    return stored;
  }

  require(viewId) {
    const snapshot = this.views.get(viewId);
    if (!snapshot) throw new PluginError('VIEW_NOT_CONNECTED', `Chorale view ${viewId} is not connected.`);
    return snapshot;
  }

  get(viewId) {
    return this.views.get(viewId);
  }

  findViewsForDocument(documentId) {
    const matched = [];
    for (const [viewId, snapshot] of this.views.entries()) {
      if (snapshot.documentId === documentId) matched.push(viewId);
    }
    return matched;
  }

  enqueue(viewId, command) {
    this.require(viewId);
    const queued = Object.freeze({ id: `command-${randomUUID()}`, ...command });
    this.commands.set(viewId, [...(this.commands.get(viewId) || []), queued]);
    this.commandAcks.set(queued.id, Promise.withResolvers());
    return queued;
  }

  notifyViews(documentId, command) {
    const viewIds = this.findViewsForDocument(documentId);
    for (const viewId of viewIds) {
      const queued = Object.freeze({ id: `command-${randomUUID()}`, ...command });
      this.commands.set(viewId, [...(this.commands.get(viewId) || []), queued]);
    }
  }

  async waitForAcknowledgement(commandId, timeoutMs = 8_000) {
    const deferred = this.commandAcks.get(commandId);
    if (!deferred) throw new PluginError('COMMAND_NOT_FOUND', 'Plugin command was not found.');
    const result = await Promise.race([deferred.promise, new Promise((resolve) => setTimeout(() => resolve({ accepted: false, timeout: true }), timeoutMs))]);
    this.commandAcks.delete(commandId);
    return result;
  }

  pending(viewId) { this.require(viewId); return this.commands.get(viewId) || []; }

  acknowledge(viewId, commandId, result = { accepted: true }) {
    const commands = this.pending(viewId);
    if (!commands.some(({ id }) => id === commandId)) throw new PluginError('COMMAND_NOT_FOUND', 'Plugin command was not found.');
    this.commands.set(viewId, commands.filter(({ id }) => id !== commandId));
    this.commandAcks.get(commandId)?.resolve(result);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:43171', 'http://localhost:43171']);

export const createViewBridge = (views = new ViewSnapshotStore(), store = new LocalDocumentStore()) => createHttpServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    response.writeHead(403).end('Origin is not allowed.');
    return;
  }
  if (origin) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'Origin');
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  // REST API: Scores
  if (request.method === 'GET' && request.url === '/v1/scores') {
    try {
      const documents = await store.list();
      response.setHeader('content-type', 'application/json');
      response.writeHead(200).end(JSON.stringify({ scores: documents.map(scoreSummary) }));
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ errorCode: 'PERSISTENCE_FAILED' }));
    }
    return;
  }

  const scoreMatch = request.url?.match(/^\/v1\/scores\/([A-Za-z0-9._-]{1,120})$/);
  if (request.method === 'GET' && scoreMatch) {
    try {
      const document = await store.require(scoreMatch[1]);
      response.setHeader('content-type', 'application/json');
      response.writeHead(200).end(JSON.stringify(document));
    } catch (error) {
      response.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'DOCUMENT_NOT_FOUND' }));
    }
    return;
  }

  // REST API: Direct MCP tool invocation
  const toolMatch = request.url?.match(/^\/v1\/tools\/([A-Za-z0-9_-]{1,80})$/);
  if (request.method === 'POST' && toolMatch) {
    const [, toolName] = toolMatch;
    const handlers = createToolHandlers(store, views);
    const handler = handlers[toolName];
    if (!handler) {
      response.setHeader('content-type', 'application/json');
      response.writeHead(404).end(JSON.stringify({ isError: true, errorCode: 'TOOL_NOT_FOUND' }));
      return;
    }
    let bodyText = '';
    request.on('data', (chunk) => { bodyText += chunk; });
    request.on('end', async () => {
      try {
        const input = bodyText ? JSON.parse(bodyText) : {};
        const res = await handler(input);
        response.setHeader('content-type', 'application/json');
        response.writeHead(res.isError ? 400 : 200).end(JSON.stringify(res));
      } catch (err) {
        response.setHeader('content-type', 'application/json');
        response.writeHead(500).end(JSON.stringify({ isError: true, content: [{ type: 'text', text: err.message }] }));
      }
    });
    return;
  }

  // REST API: View bridge
  const match = request.url?.match(/^\/v1\/views\/([A-Za-z0-9._-]{1,120})(?:\/commands(?:\/(command-[A-Za-z0-9-]+)\/ack)?)?$/);
  if (match) {
    const [, viewId, commandId] = match;
    if (request.method === 'GET' && !request.url?.includes('/commands')) {
      try {
        const snapshot = views.require(viewId);
        response.setHeader('content-type', 'application/json');
        response.writeHead(200).end(JSON.stringify(snapshot));
      } catch (error) {
        if (!response.headersSent) response.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'VIEW_NOT_CONNECTED' }));
      }
      return;
    }
    if (request.method === 'GET' && request.url?.endsWith('/commands')) {
      try {
        const body = JSON.stringify({ commands: views.pending(viewId) });
        response.setHeader('content-type', 'application/json');
        response.writeHead(200).end(body);
      } catch (error) {
        if (!response.headersSent) response.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'VIEW_NOT_CONNECTED' }));
      }
      return;
    }
    if (request.method === 'POST' && commandId) {
      request.resume();
      request.on('end', () => {
        try {
          views.acknowledge(viewId, commandId);
          response.writeHead(204).end();
        } catch (error) {
          response.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'COMMAND_NOT_FOUND' }));
        }
      });
      return;
    }
    if (request.method === 'PUT') {
      let size = 0;
      const chunks = [];
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_VIEW_SNAPSHOT_BYTES) request.destroy();
        else chunks.push(chunk);
      });
      request.on('end', () => {
        try {
          if (size > MAX_VIEW_SNAPSHOT_BYTES) throw new PluginError('INVALID_VIEW', 'View snapshot exceeds the 2 MB limit.');
          const snapshot = views.update(viewId, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          response.setHeader('content-type', 'application/json');
          response.writeHead(200).end(JSON.stringify({ viewId, revision: snapshot.revision }));
        } catch (error) {
          response.setHeader('content-type', 'application/json');
          response.writeHead(400).end(JSON.stringify({ errorCode: error instanceof PluginError ? error.code : 'INVALID_VIEW' }));
        }
      });
      return;
    }
  }

  // Static web server fallback (serving dist/ if present)
  if (request.method === 'GET') {
    const parsedPath = request.url?.split('?')[0] || '/';
    const candidatePath = parsedPath === '/' ? join(DIST_DIR, 'index.html') : join(DIST_DIR, parsedPath.replace(/^\//, ''));
    if (existsSync(candidatePath)) {
      try {
        const fileStat = await stat(candidatePath);
        if (fileStat.isFile()) {
          const content = await readFile(candidatePath);
          const ext = extname(candidatePath);
          response.setHeader('content-type', MIME_TYPES[ext] || 'application/octet-stream');
          response.writeHead(200).end(content);
          return;
        }
      } catch {
        // Fall through to 404
      }
    }
  }

  response.writeHead(404).end('Not found.');
});

export const listenForPluginViews = (views, store, port = Number(process.env.CHORALE_PLUGIN_BRIDGE_PORT || DEFAULT_BRIDGE_PORT)) => new Promise((resolveListen, rejectListen) => {
  const bridge = createViewBridge(views, store);
  bridge.once('error', rejectListen);
  bridge.listen(port, '127.0.0.1', () => {
    bridge.off('error', rejectListen);
    resolveListen(bridge);
  });
});

const result = (structuredContent, text) => ({
  structuredContent,
  content: [{ type: 'text', text }],
});

const failure = (error) => ({
  isError: true,
  structuredContent: { errorCode: error instanceof PluginError ? error.code : 'PERSISTENCE_FAILED' },
  content: [{ type: 'text', text: error instanceof Error ? error.message : 'The Chorale tool failed.' }],
});

const workspaceHtml = `<!doctype html><html><body style="margin:0;background:#f6f0e6;color:#2e2925;font:14px system-ui"><main style="padding:16px"><h1 style="font-family:Georgia,serif;margin-top:0">Chorale</h1><div id="score">Loading score…</div></main><script>window.addEventListener('message',(event)=>{if(event.source!==parent)return;const data=event.data;if(data?.method!=='ui/notifications/tool-result')return;const score=data.params?.structuredContent;document.querySelector('#score').textContent=score?score.title+' · '+score.measureCount+' measures · revision '+score.revision:'No score selected.'},{passive:true});</script></body></html>`;

export const createToolHandlers = (store, views) => ({
  create_score: async (input) => {
    try {
      const document = await store.create(input);
      return result(scoreSummary(document), `Created score "${document.title}" (revision 1, ${document.id}).`);
    } catch (error) {
      return failure(error);
    }
  },
  list_scores: async () => {
    try {
      const documents = await store.list();
      return result({ scores: documents.map(scoreSummary) }, `${documents.length} score(s) available.`);
    } catch (error) {
      return failure(error);
    }
  },
  get_score_summary: async ({ documentId }) => {
    try {
      const document = await store.require(documentId);
      return result(scoreSummary(document), `Score "${document.title}", revision ${document.revision}, ${document.annotations.length} annotation(s).`);
    } catch (error) {
      return failure(error);
    }
  },
  read_measure_range: async ({ documentId, startMeasure, endMeasure, viewId }) => {
    try {
      if (viewId) {
        const snapshot = views.require(viewId);
        const range = { startMeasure, endMeasure };
        if (range.startMeasure !== snapshot.selection?.startMeasure || range.endMeasure !== snapshot.selection?.endMeasure || !snapshot.selectedAbc) {
          throw new PluginError('INVALID_RANGE', 'The connected view does not currently have measures ' + startMeasure + '–' + endMeasure + ' selected.');
        }
        return result({
          documentId: snapshot.documentId,
          title: snapshot.title,
          revision: snapshot.revision,
          viewId,
          range,
          abcSource: snapshot.selectedAbc,
        }, `Read captured measures ${startMeasure}–${endMeasure} of ${snapshot.title}.`);
      }
      if (!documentId) throw new PluginError('INVALID_RANGE', 'Provide documentId and inclusive measure range, or viewId.');
      const document = await store.require(documentId);
      const measures = measureBodies(document.abcSource);
      if (endMeasure < startMeasure || endMeasure > measures.length) {
        throw new PluginError('INVALID_RANGE', `Choose measures within 1–${measures.length}.`);
      }
      const source = measures.slice(startMeasure - 1, endMeasure);
      return result({
        ...scoreSummary(document),
        range: { startMeasure, endMeasure },
        measures: source,
      }, `Read measures ${startMeasure}–${endMeasure} of "${document.title}".`);
    } catch (error) {
      return failure(error);
    }
  },
  read_measure_selection: async ({ viewId = 'plugin-main' } = {}) => {
    try {
      const snapshot = views.require(viewId);
      if (!snapshot.selection) {
        throw new PluginError('INVALID_RANGE', 'No written measures are currently selected in this view.');
      }
      return result({
        documentId: snapshot.documentId,
        title: snapshot.title,
        revision: snapshot.revision,
        viewId,
        selection: snapshot.selection,
        abcSource: snapshot.selectedAbc,
      }, `Selected measures ${snapshot.selection.startMeasure}–${snapshot.selection.endMeasure} of "${snapshot.title}".`);
    } catch (error) {
      return failure(error);
    }
  },
  edit_score: async ({ documentId, expectedRevision, replacementAbc, summary, viewId }) => {
    try {
      const { document } = await store.editScore({ documentId, expectedRevision, replacementAbc, summary });
      views.notifyViews(documentId, { kind: 'replace-score', documentId, expectedRevision, replacementAbc, summary });
      return result({
        ...scoreSummary(document),
        summary,
      }, `Updated score "${document.title}" to revision ${document.revision}: ${summary}`);
    } catch (error) {
      return failure(error);
    }
  },
  add_annotations: async ({ documentId, expectedRevision, annotations }) => {
    try {
      const { document, annotations: added } = await store.addAnnotations({ documentId, expectedRevision, annotations });
      views.notifyViews(documentId, { kind: 'annotations', documentId, expectedRevision, annotations: added });
      return result({
        ...scoreSummary(document),
        addedAnnotations: added,
      }, `Added ${added.length} annotation(s) to "${document.title}" (now revision ${document.revision}).`);
    } catch (error) {
      return failure(error);
    }
  },
  edit_annotations: async ({ documentId, expectedRevision, annotationId, updates }) => {
    try {
      const { document, annotation } = await store.editAnnotations({ documentId, expectedRevision, annotationId, updates });
      views.notifyViews(documentId, { kind: 'update-annotation', documentId, expectedRevision, annotation });
      return result({
        ...scoreSummary(document),
        updatedAnnotation: annotation,
      }, `Updated annotation "${annotation.label || annotation.id}" on "${document.title}".`);
    } catch (error) {
      return failure(error);
    }
  },
  delete_annotations: async ({ documentId, expectedRevision, annotationIds }) => {
    try {
      const { document, deletedCount } = await store.deleteAnnotations({ documentId, expectedRevision, annotationIds });
      views.notifyViews(documentId, { kind: 'delete-annotations', documentId, expectedRevision, annotationIds });
      return result({
        ...scoreSummary(document),
        deletedCount,
      }, `Deleted ${deletedCount} annotation(s) from "${document.title}".`);
    } catch (error) {
      return failure(error);
    }
  },
  render_score_workspace: async ({ documentId }) => {
    try {
      const document = await store.require(documentId);
      const summary = scoreSummary(document);
      return result(summary, `Opening "${document.title}".`);
    } catch (error) {
      return failure(error);
    }
  },
});

export const createServer = (store = new LocalDocumentStore(), views = new ViewSnapshotStore()) => {
  const server = new McpServer({ name: 'Chorale', version: '0.1.0' });
  const handlers = createToolHandlers(store, views);

  server.registerResource('chorale-workspace', WORKSPACE_URI, {}, async () => ({
    contents: [{ uri: WORKSPACE_URI, mimeType: 'text/html;profile=mcp-app', text: workspaceHtml, _meta: { ui: { prefersBorder: false } } }],
  }));

  // Tool 1: create_score
  server.registerTool('create_score', {
    title: 'Create Chorale score',
    description: 'Create a durable local score from valid ABC source notation.',
    inputSchema: {
      title: z.string().max(160).describe('Title of the score'),
      abcSource: z.string().min(1).max(MAX_ABC_BYTES).describe('Complete, valid ABC music source'),
    },
  }, handlers.create_score);

  // Tool 2: list_scores
  server.registerTool('list_scores', {
    title: 'List Chorale scores',
    description: 'List locally saved Chorale scores with title, revision, measure count, and annotation count.',
  }, handlers.list_scores);

  // Tool 3: get_score_summary
  server.registerTool('get_score_summary', {
    title: 'Get score summary',
    description: 'Read the current revision, title, measure count, and annotations summary for a score.',
    inputSchema: {
      documentId: z.string().min(1).describe('The unique score document ID'),
    },
  }, handlers.get_score_summary);

  // Tool 4: read_measure_range
  server.registerTool('read_measure_range', {
    title: 'Read written measures',
    description: 'Read an exact inclusive range of written measures from a score or connected view.',
    inputSchema: {
      documentId: z.string().min(1).optional().describe('Score ID (optional if viewId is provided)'),
      startMeasure: z.number().int().min(1).describe('Starting 1-indexed written measure number (inclusive)'),
      endMeasure: z.number().int().min(1).describe('Ending 1-indexed written measure number (inclusive)'),
      viewId: z.string().min(1).optional().describe('Optional connected view ID (e.g. "plugin-main")'),
    },
  }, handlers.read_measure_range);

  // Tool 5: read_measure_selection
  server.registerTool('read_measure_selection', {
    title: 'Read selected measures',
    description: 'Read the currently selected written-measure range and ABC excerpt from a connected Chorale score view.',
    inputSchema: {
      viewId: z.string().min(1).default('plugin-main').describe('Connected view ID (default: "plugin-main")'),
    },
  }, handlers.read_measure_selection);

  // Tool 6: edit_score
  server.registerTool('edit_score', {
    title: 'Edit score',
    description: 'Authoritatively replace and update the ABC source of a score. Directly mutates the server store and synchronizes with any active view.',
    inputSchema: {
      documentId: z.string().min(1).describe('The unique score document ID'),
      expectedRevision: z.number().int().positive().describe('Expected current revision of the score for concurrency control'),
      replacementAbc: z.string().min(1).max(MAX_ABC_BYTES).describe('New ABC source notation for the complete score'),
      summary: z.string().min(1).max(500).describe('Brief explanation of what musical changes were made'),
      viewId: z.string().min(1).optional().describe('Optional connected view ID to notify'),
    },
  }, handlers.edit_score);

  // Tool 7: add_annotations
  server.registerTool('add_annotations', {
    title: 'Add annotations',
    description: 'Add one or more musical annotations to specific measure ranges in the score.',
    inputSchema: {
      documentId: z.string().min(1).describe('The unique score document ID'),
      expectedRevision: z.number().int().positive().describe('Expected current revision of the score'),
      annotations: z.array(z.object({
        startMeasure: z.number().int().min(1).describe('Start measure (1-indexed, inclusive)'),
        endMeasure: z.number().int().min(1).describe('End measure (1-indexed, inclusive)'),
        label: z.string().max(100).describe('Short label or title for the annotation'),
        body: z.string().max(2000).describe('Detailed note, analysis, or explanation'),
        kind: z.enum(['chord', 'modulation', 'voice-leading', 'explanation']).optional().describe('Kind of annotation'),
        chordSymbol: z.string().max(40).optional().describe('Chord symbol (e.g. "E", "G#m", "B7")'),
        romanNumeral: z.string().max(40).optional().describe('Roman numeral analysis (e.g. "I", "V7", "vi")'),
      })).min(1).describe('List of annotations to add'),
    },
  }, handlers.add_annotations);

  // Tool 8: edit_annotations
  server.registerTool('edit_annotations', {
    title: 'Edit annotation',
    description: 'Update the label, text, or measure range of an existing annotation.',
    inputSchema: {
      documentId: z.string().min(1).describe('The unique score document ID'),
      expectedRevision: z.number().int().positive().describe('Expected current revision of the score'),
      annotationId: z.string().min(1).describe('The unique annotation ID to edit'),
      updates: z.object({
        startMeasure: z.number().int().min(1).optional(),
        endMeasure: z.number().int().min(1).optional(),
        label: z.string().max(100).optional(),
        body: z.string().max(2000).optional(),
      }).describe('Fields to update on the annotation'),
    },
  }, handlers.edit_annotations);

  // Tool 9: delete_annotations
  server.registerTool('delete_annotations', {
    title: 'Delete annotations',
    description: 'Remove one or more annotations from a score document by their IDs.',
    inputSchema: {
      documentId: z.string().min(1).describe('The unique score document ID'),
      expectedRevision: z.number().int().positive().describe('Expected current revision of the score'),
      annotationIds: z.array(z.string().min(1)).min(1).describe('List of annotation IDs to delete'),
    },
  }, handlers.delete_annotations);

  // Tool 10: render_score_workspace
  server.registerTool('render_score_workspace', {
    title: 'Open Chorale workspace',
    description: 'Render the selected score in an optional interactive MCP Apps workspace view.',
    inputSchema: {
      documentId: z.string().min(1).describe('The unique score document ID to render'),
    },
    outputSchema: {
      documentId: z.string(),
      title: z.string(),
      revision: z.number(),
      measureCount: z.number(),
      annotationCount: z.number(),
      updatedAt: z.string(),
    },
    _meta: {
      ui: { resourceUri: WORKSPACE_URI },
      'openai/toolInvocation/invoking': 'Opening score…',
      'openai/toolInvocation/invoked': 'Score opened.',
    },
  }, handlers.render_score_workspace);

  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const views = new ViewSnapshotStore();
  const store = new LocalDocumentStore(process.env.CHORALE_PLUGIN_STORE || defaultStorePath, views);
  await listenForPluginViews(views, store);
  const server = createServer(store, views);
  await server.connect(new StdioServerTransport());
}
