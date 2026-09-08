import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

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
  constructor(storePath = process.env.CHORALE_PLUGIN_STORE || defaultStorePath) {
    this.storePath = resolve(storePath);
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

  async require(documentId) {
    const document = (await this.list()).find((candidate) => candidate.id === documentId);
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

  async addAnnotation({ documentId, expectedRevision, startMeasure, endMeasure, label, body }) {
    const state = await this.read();
    const index = state.documents.findIndex((candidate) => candidate.id === documentId);
    if (index === -1) throw new PluginError('DOCUMENT_NOT_FOUND', `Score ${documentId} was not found.`);
    const document = state.documents[index];
    if (document.revision !== expectedRevision) {
      throw new PluginError('REVISION_CONFLICT', `Score is at revision ${document.revision}, not ${expectedRevision}.`);
    }
    const measureCount = measureBodies(document.abcSource).length;
    if (startMeasure < 1 || endMeasure < startMeasure || endMeasure > measureCount) {
      throw new PluginError('INVALID_RANGE', `Choose measures within 1–${measureCount}.`);
    }
    const now = new Date().toISOString();
    const annotation = {
      id: `annotation-${randomUUID()}`,
      span: { startMeasure, endMeasure },
      label: label.trim(),
      body: body.trim(),
      source: 'assistant',
      createdAt: now,
      updatedAt: now,
    };
    document.annotations.push(annotation);
    document.revision += 1;
    document.updatedAt = now;
    await this.write(state);
    return { document, annotation };
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
      throw new PluginError('INVALID_VIEW', 'A view snapshot must identify its document.');
    }
    if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
      throw new PluginError('INVALID_VIEW', 'A view snapshot must include a positive revision.');
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

  enqueue(viewId, command) {
    this.require(viewId);
    const queued = Object.freeze({ id: `command-${randomUUID()}`, ...command });
    this.commands.set(viewId, [...(this.commands.get(viewId) || []), queued]);
    this.commandAcks.set(queued.id, Promise.withResolvers());
    return queued;
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

const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

export const createViewBridge = (views = new ViewSnapshotStore()) => createHttpServer((request, response) => {
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
  const match = request.url?.match(/^\/v1\/views\/([A-Za-z0-9._-]{1,120})(?:\/commands(?:\/(command-[A-Za-z0-9-]+)\/ack)?)?$/);
  if (!match) {
    response.writeHead(404).end('Not found.');
    return;
  }
  const [, viewId, commandId] = match;
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
    request.resume(); request.on('end', () => { try { views.acknowledge(viewId, commandId); response.writeHead(204).end(); } catch (error) { response.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'COMMAND_NOT_FOUND' })); } });
    return;
  }
  if (request.method !== 'PUT') { response.writeHead(404).end('Not found.'); return; }
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
});

export const listenForPluginViews = (views, port = Number(process.env.CHORALE_PLUGIN_BRIDGE_PORT || DEFAULT_BRIDGE_PORT)) => new Promise((resolveListen, rejectListen) => {
  const bridge = createViewBridge(views);
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

export const createServer = (store = new LocalDocumentStore(), views = new ViewSnapshotStore()) => {
  const server = new McpServer({ name: 'Chorale', version: '0.1.0' });
  server.registerResource('chorale-workspace', WORKSPACE_URI, {}, async () => ({
    contents: [{ uri: WORKSPACE_URI, mimeType: 'text/html;profile=mcp-app', text: workspaceHtml, _meta: { ui: { prefersBorder: false } } }],
  }));

  server.registerTool('create_score', {
    title: 'Create Chorale score', description: 'Create a durable local score from valid ABC source.',
    inputSchema: { title: z.string().max(160), abcSource: z.string().min(1).max(MAX_ABC_BYTES) },
  }, async (input) => { try { const document = await store.create(input); return result(scoreSummary(document), `Created ${document.title}.`); } catch (error) { return failure(error); } });

  server.registerTool('list_scores', {
    title: 'List Chorale scores', description: 'List locally saved Chorale scores without opening the score UI.',
  }, async () => { try { const documents = await store.list(); return result({ scores: documents.map(scoreSummary) }, `${documents.length} score(s) available.`); } catch (error) { return failure(error); } });

  server.registerTool('get_score_summary', {
    title: 'Get score summary', description: 'Read the current revision and summary for a score.', inputSchema: { documentId: z.string().min(1) },
  }, async ({ documentId }) => { try { const document = await store.require(documentId); return result(scoreSummary(document), `${document.title}, revision ${document.revision}.`); } catch (error) { return failure(error); } });

  server.registerTool('read_measure_range', {
    title: 'Read written measures', description: 'Read an exact inclusive range of written measures from a saved score or a connected plugin view.',
    inputSchema: { documentId: z.string().min(1).optional(), startMeasure: z.number().int().min(1).optional(), endMeasure: z.number().int().min(1).optional(), viewId: z.string().min(1).optional() },
  }, async ({ documentId, startMeasure, endMeasure, viewId }) => { try {
    if (viewId) {
      const snapshot = views.require(viewId);
      const range = startMeasure && endMeasure ? { startMeasure, endMeasure } : snapshot.selection;
      if (!range) throw new PluginError('INVALID_RANGE', 'Select written measures in the Chorale page before reading the current view.');
      if (range.startMeasure !== snapshot.selection?.startMeasure || range.endMeasure !== snapshot.selection?.endMeasure || !snapshot.selectedAbc) {
        throw new PluginError('INVALID_RANGE', 'This prototype can read the current captured selection only; select the requested range in Chorale first.');
      }
      return result({ documentId: snapshot.documentId, title: snapshot.title, revision: snapshot.revision, viewId, range, abcSource: snapshot.selectedAbc }, `Read the captured measures ${range.startMeasure}–${range.endMeasure} of ${snapshot.title}.`);
    }
    if (!documentId || !startMeasure || !endMeasure) throw new PluginError('INVALID_RANGE', 'Provide a document and inclusive measure range, or a connected view ID.');
    const document = await store.require(documentId); const measures = measureBodies(document.abcSource); if (endMeasure < startMeasure || endMeasure > measures.length) throw new PluginError('INVALID_RANGE', `Choose measures within 1–${measures.length}.`); const source = measures.slice(startMeasure - 1, endMeasure); return result({ ...scoreSummary(document), range: { startMeasure, endMeasure }, measures: source }, `Read measures ${startMeasure}–${endMeasure} of ${document.title}.`);
  } catch (error) { return failure(error); } });

  server.registerTool('get_selection', {
    title: 'Get selected written measures', description: 'Read the immutable current written-measure selection from a particular connected Chorale plugin view.',
    inputSchema: { viewId: z.string().min(1).default('plugin-main') },
  }, async ({ viewId }) => { try {
    const snapshot = views.require(viewId);
    if (!snapshot.selection) throw new PluginError('INVALID_RANGE', 'No written measures are selected in this Chorale view.');
    return result({ documentId: snapshot.documentId, title: snapshot.title, revision: snapshot.revision, viewId, selection: snapshot.selection, abcSource: snapshot.selectedAbc }, `Selected measures ${snapshot.selection.startMeasure}–${snapshot.selection.endMeasure} of ${snapshot.title}.`);
  } catch (error) { return failure(error); } });

  server.registerTool('propose_annotations', {
    title: 'Propose annotations', description: 'Write assistant-origin annotations through to the connected Chorale document after checking its revision.',
    inputSchema: { viewId: z.string().min(1).default('plugin-main'), expectedRevision: z.number().int().positive(), annotations: z.array(z.object({}).passthrough()).min(1) },
  }, async ({ viewId, expectedRevision, annotations }) => { try {
    const view = views.require(viewId);
    if (view.revision !== expectedRevision) throw new PluginError('REVISION_CONFLICT', `Chorale view is at revision ${view.revision}, not ${expectedRevision}.`);
    const command = views.enqueue(viewId, { kind: 'annotations', documentId: view.documentId, expectedRevision, annotations });
    const acknowledgement = await views.waitForAcknowledgement(command.id);
    if (!acknowledgement.accepted) throw new PluginError('COMMAND_REJECTED', acknowledgement.timeout ? 'Chorale did not acknowledge the annotation command.' : 'Chorale rejected the annotation command.');
    return result({ documentId: view.documentId, revision: view.revision, commandId: command.id }, `Queued ${annotations.length} annotation(s) for ${view.title}.`);
  } catch (error) { return failure(error); } });

  server.registerTool('propose_score_edit', {
    title: 'Propose score edit', description: 'Write a complete ABC replacement through to the connected Chorale document after checking its revision.',
    inputSchema: { viewId: z.string().min(1).default('plugin-main'), expectedRevision: z.number().int().positive(), replacementAbc: z.string().min(1).max(MAX_ABC_BYTES), summary: z.string().min(1).max(500) },
  }, async ({ viewId, expectedRevision, replacementAbc, summary }) => { try {
    const view = views.require(viewId);
    if (view.revision !== expectedRevision) throw new PluginError('REVISION_CONFLICT', `Chorale view is at revision ${view.revision}, not ${expectedRevision}.`);
    const command = views.enqueue(viewId, { kind: 'replace-score', documentId: view.documentId, expectedRevision, replacementAbc, summary });
    const acknowledgement = await views.waitForAcknowledgement(command.id);
    if (!acknowledgement.accepted) throw new PluginError('COMMAND_REJECTED', acknowledgement.timeout ? 'Chorale did not acknowledge the score edit.' : 'Chorale rejected the score edit.');
    return result({ documentId: view.documentId, revision: view.revision, commandId: command.id }, `Queued score edit for ${view.title}.`);
  } catch (error) { return failure(error); } });

  server.registerTool('render_score_workspace', {
    title: 'Open Chorale workspace', description: 'Render the selected score in an optional MCP Apps workspace view.', inputSchema: { documentId: z.string().min(1) }, outputSchema: { documentId: z.string(), title: z.string(), revision: z.number(), measureCount: z.number(), annotationCount: z.number(), updatedAt: z.string() },
    _meta: { ui: { resourceUri: WORKSPACE_URI }, 'openai/toolInvocation/invoking': 'Opening score…', 'openai/toolInvocation/invoked': 'Score opened.' },
  }, async ({ documentId }) => { try { const document = await store.require(documentId); const summary = scoreSummary(document); return result(summary, `Opening ${document.title}.`); } catch (error) { return failure(error); } });
  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const views = new ViewSnapshotStore();
  await listenForPluginViews(views);
  const server = createServer(new LocalDocumentStore(), views);
  await server.connect(new StdioServerTransport());
}
