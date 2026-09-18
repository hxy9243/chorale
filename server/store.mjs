import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { measureBodies } from './utils/measure-ops.mjs';

export const generateDocumentId = () => `score-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
export const generateHistoryId = () => `hist-${randomUUID().replace(/-/g, '').slice(0, 16)}`;

export class PluginError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
  }
}

export const scoreSummary = (document) => ({
  documentId: document.id,
  title: document.title || document.scoreInfo?.title || document.name || 'Untitled score',
  revision: document.revision || 1,
  measureCount: measureBodies(document.abcSource || '').length,
  annotationCount: Array.isArray(document.annotations) ? document.annotations.length : 0,
  updatedAt: document.updatedAt || new Date().toISOString(),
});

export const defaultPianoTemplate = (title = 'Untitled Score', composer = 'Anonymous', meter = '4/4', key = 'C') => `X:1
T:${title}
C:${composer}
M:${meter}
L:1/4
Q:1/4=100
K:${key}
V:1 clef=treble
V:2 clef=bass
[V:1] C E G c | c G E C |
[V:2] [C,,C,]4 | [C,,C,]4 |
`;

const parseJson = (val, fallback) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const rowToDocument = (row, versions = [], history = []) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    sourceType: row.source_type || 'abc',
    scoreInfo: parseJson(row.score_info, {}),
    revision: row.revision,
    abcSource: row.abc_source,
    annotations: parseJson(row.annotations, []),
    chats: parseJson(row.chats, []),
    versions: versions.map((v) => ({
      revision: v.revision,
      abcSource: v.abc_source,
      createdAt: v.created_at,
      reason: v.reason,
    })),
    history: history.map((h) => ({
      id: h.id,
      revision: h.revision,
      timestamp: h.timestamp,
      category: h.category,
      actionType: h.action_type,
      summary: h.summary,
      abcSource: h.abc_source,
      scoreInfo: parseJson(h.score_info, {}),
      annotations: parseJson(h.annotations, []),
    })),
    historyIndex: row.history_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export class LocalDocumentStore {
  constructor(options = {}) {
    this.strictMirror = Boolean(options.strictMirror);
    this.choraleDir = resolve(options.baseDir || process.env.CHORALE_HOME || join(homedir(), '.chorale'));
    this.scoresDir = join(this.choraleDir, 'scores');
    this.views = options.views || null;
    this.mutationTail = Promise.resolve();
    this.dbPath = this.resolveDbPath(options);

    if (this.dbPath !== ':memory:') {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      mkdirSync(this.scoresDir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    this.initSchema();
  }

  resolveDbPath(options = {}) {
    const rawDbPath = options.dbPath || process.env.CHORALE_DB_PATH;
    if (rawDbPath === ':memory:' || options.baseDir === ':memory:') {
      return ':memory:';
    }
    if (rawDbPath) {
      const resolved = resolve(rawDbPath);
      try {
        if (existsSync(resolved) && statSync(resolved).isDirectory()) {
          return join(resolved, 'chorale.db');
        }
      } catch {}
      return resolved;
    }

    const legacyStorePath = options.storePath || process.env.CHORALE_STORE_PATH;
    if (legacyStorePath) {
      const resolved = resolve(legacyStorePath);
      try {
        if (existsSync(resolved) && statSync(resolved).isDirectory()) {
          return join(resolved, 'chorale.db');
        }
      } catch {}
      if (/\.json$/i.test(resolved)) {
        return resolved.replace(/\.json$/i, '.db');
      }
      if (/\.db$/i.test(resolved) || /\.sqlite$/i.test(resolved)) {
        return resolved;
      }
      return join(resolved, 'chorale.db');
    }

    return join(this.choraleDir, 'chorale.db');
  }

  get storePath() {
    return this.dbPath;
  }

  setViews(views) {
    this.views = views;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  getMeta(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setMeta(key, value) {
    this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL DEFAULT 0,
        preferences TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'abc',
        revision INTEGER NOT NULL DEFAULT 1,
        abc_source TEXT NOT NULL,
        score_info TEXT NOT NULL DEFAULT '{}',
        annotations TEXT NOT NULL DEFAULT '[]',
        chats TEXT NOT NULL DEFAULT '[]',
        history_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_documents (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS document_versions (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        abc_source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'edit',
        PRIMARY KEY (document_id, revision)
      );

      CREATE TABLE IF NOT EXISTS document_history (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        action_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        abc_source TEXT NOT NULL,
        score_info TEXT NOT NULL DEFAULT '{}',
        annotations TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
      INSERT OR IGNORE INTO workspace (id, revision, preferences) VALUES (1, 0, '{}');
    `);
  }

  serializeMutation(operation) {
    const next = this.mutationTail.then(operation, operation);
    this.mutationTail = next.catch(() => {});
    return next;
  }

  async mirrorAbcFile(documentId, abcSource) {
    if (!this.scoresDir || this.dbPath === ':memory:') return;
    try {
      await mkdir(this.scoresDir, { recursive: true });
      await writeFile(join(this.scoresDir, `${documentId}.abc`), abcSource, 'utf8');
    } catch (err) {
      console.warn(`[Chorale Store] Failed to mirror ABC file for score "${documentId}":`, err instanceof Error ? err.message : err);
      if (this.strictMirror) {
        throw new PluginError('MIRROR_FAILED', `Failed to mirror ABC file for score "${documentId}": ${err.message}`);
      }
    }
  }

  async unmirrorAbcFile(documentId) {
    if (!this.scoresDir || this.dbPath === ':memory:') return;
    try {
      await unlink(join(this.scoresDir, `${documentId}.abc`));
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[Chorale Store] Failed to remove mirrored ABC file for score "${documentId}":`, err instanceof Error ? err.message : err);
        if (this.strictMirror) {
          throw new PluginError('MIRROR_FAILED', `Failed to remove mirrored ABC file for score "${documentId}": ${err.message}`);
        }
      }
    }
  }

  listSync() {
    const docRows = this.db.prepare(`
      SELECT d.* FROM documents d
      LEFT JOIN workspace_documents wd ON d.id = wd.document_id
      ORDER BY wd.sort_order ASC, d.created_at ASC
    `).all();

    if (docRows.length === 0) return [];

    const versionRows = this.db.prepare(`
      SELECT * FROM document_versions ORDER BY revision ASC
    `).all();
    const versionsByDoc = new Map();
    for (const v of versionRows) {
      if (!versionsByDoc.has(v.document_id)) versionsByDoc.set(v.document_id, []);
      versionsByDoc.get(v.document_id).push(v);
    }

    const historyRows = this.db.prepare(`
      SELECT * FROM document_history ORDER BY sort_order ASC
    `).all();
    const historyByDoc = new Map();
    for (const h of historyRows) {
      if (!historyByDoc.has(h.document_id)) historyByDoc.set(h.document_id, []);
      historyByDoc.get(h.document_id).push(h);
    }

    return docRows.map((row) => rowToDocument(row, versionsByDoc.get(row.id) || [], historyByDoc.get(row.id) || []));
  }

  async list() {
    return this.listSync();
  }

  requireSync(documentId) {
    const docRow = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
    if (!docRow) {
      throw new PluginError('DOCUMENT_NOT_FOUND', `Score document "${documentId}" was not found.`);
    }

    const versions = this.db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY revision ASC').all(documentId);
    const history = this.db.prepare('SELECT * FROM document_history WHERE document_id = ? ORDER BY sort_order ASC').all(documentId);
    return rowToDocument(docRow, versions, history);
  }

  async require(documentId) {
    return this.requireSync(documentId);
  }

  async read() {
    const ws = this.getWorkspaceSync();
    const versionVal = this.getMeta('schema_version');
    const schemaVersion = versionVal ? Number(versionVal) || 1 : 1;
    return {
      schemaVersion,
      documents: ws.documents,
      workspaceRevision: ws.revision,
      workspace: ws,
    };
  }

  async write(state) {
    const documents = state.documents || state.workspace?.documents || [];
    const preferences = state.workspace?.preferences || {};
    return this.putWorkspace({ documents, preferences });
  }

  async create(input) {
    return this.serializeMutation(() => this.createUnsafe(input));
  }

  async createUnsafe(input = {}) {
    const { title = 'Untitled score', abcSource = '', composer = 'Anonymous', meter = '4/4', key = 'C' } = input;
    let documentId = input.id;
    if (!documentId) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateDocumentId();
        const existing = this.db.prepare('SELECT id FROM documents WHERE id = ?').get(candidate);
        if (!existing) {
          documentId = candidate;
          break;
        }
      }
      if (!documentId) {
        documentId = `score-${randomUUID()}`;
      }
    }
    const source = abcSource.trim() || defaultPianoTemplate(title, composer, meter, key);
    const now = new Date().toISOString();
    const safeTitle = title || 'Untitled score';
    const name = safeTitle.endsWith('.abc') ? safeTitle : `${safeTitle}.abc`;
    const scoreInfo = { title: safeTitle, composer, meter, key };
    const historyId = generateHistoryId();
    const historyEntry = {
      id: historyId,
      revision: 1,
      timestamp: now,
      category: 'origin',
      actionType: 'initial',
      summary: `Initial score: ${safeTitle}`,
      abcSource: source,
      scoreInfo,
      annotations: [],
    };
    const version = {
      revision: 1,
      abcSource: source,
      createdAt: now,
      reason: 'import',
    };

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const existingDoc = this.db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
      if (existingDoc) {
        this.db.exec('ROLLBACK;');
        throw new PluginError('DOCUMENT_EXISTS', `Score document "${documentId}" already exists.`);
      }

      const maxOrderRow = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM workspace_documents').get();
      const nextOrder = (maxOrderRow?.max_order ?? -1) + 1;

      this.db.prepare(`
        INSERT INTO documents (id, name, title, source_type, revision, abc_source, score_info, annotations, chats, history_index, created_at, updated_at)
        VALUES (?, ?, ?, 'abc', 1, ?, ?, '[]', '[]', 0, ?, ?)
      `).run(documentId, name, safeTitle, source, JSON.stringify(scoreInfo), now, now);

      this.db.prepare(`
        INSERT INTO workspace_documents (document_id, sort_order) VALUES (?, ?)
      `).run(documentId, nextOrder);

      this.db.prepare(`
        INSERT INTO document_versions (document_id, revision, abc_source, created_at, reason)
        VALUES (?, 1, ?, ?, 'import')
      `).run(documentId, source, now);

      this.db.prepare(`
        INSERT INTO document_history (id, document_id, revision, timestamp, category, action_type, summary, abc_source, score_info, annotations, sort_order)
        VALUES (?, ?, 1, ?, 'origin', 'initial', ?, ?, ?, '[]', 0)
      `).run(historyId, documentId, now, historyEntry.summary, source, JSON.stringify(scoreInfo));

      this.db.prepare(`
        UPDATE workspace SET revision = revision + 1 WHERE id = 1
      `).run();

      this.db.exec('COMMIT;');
    } catch (err) {
      if (!(err instanceof PluginError)) {
        try { this.db.exec('ROLLBACK;'); } catch {}
        if (err?.code === 'ERR_SQLITE_ERROR' && String(err.message).includes('UNIQUE constraint failed')) {
          throw new PluginError('DOCUMENT_EXISTS', `Score document "${documentId}" already exists (ID collision).`);
        }
        throw new PluginError('PERSISTENCE_FAILED', `Failed to create score: ${err.message}`);
      }
      throw err;
    }

    await this.mirrorAbcFile(documentId, source);

    const document = {
      id: documentId,
      name,
      title: safeTitle,
      sourceType: 'abc',
      scoreInfo,
      revision: 1,
      abcSource: source,
      annotations: [],
      chats: [],
      versions: [version],
      history: [historyEntry],
      historyIndex: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (this.views) {
      this.views.broadcastCommand({
        type: 'FILE_CREATED',
        documentId,
        title,
      });
    }

    return document;
  }

  async update(documentId, updates = {}) {
    return this.serializeMutation(() => this.updateUnsafe(documentId, updates));
  }

  async updateUnsafe(documentId, updates = {}) {
    this.db.exec('BEGIN IMMEDIATE;');
    let updatedDoc;
    try {
      const docRow = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
      if (!docRow) {
        this.db.exec('ROLLBACK;');
        throw new PluginError('DOCUMENT_NOT_FOUND', `Score document "${documentId}" was not found.`);
      }

      if (updates.expectedRevision !== undefined && updates.expectedRevision !== docRow.revision) {
        this.db.exec('ROLLBACK;');
        throw new PluginError(
          'REVISION_CONFLICT',
          `Score "${documentId}" is at revision ${docRow.revision}, but expected revision was ${updates.expectedRevision}.`,
        );
      }

      const nextRevision = (docRow.revision || 1) + 1;
      const now = new Date().toISOString();

      const newTitle = updates.title !== undefined ? updates.title : docRow.title;
      const newName = updates.name !== undefined ? updates.name : (updates.title ? (updates.title.endsWith('.abc') ? updates.title : `${updates.title}.abc`) : docRow.name);
      const newAbcSource = updates.abcSource !== undefined ? updates.abcSource : docRow.abc_source;
      const newScoreInfo = updates.scoreInfo !== undefined ? JSON.stringify(updates.scoreInfo) : docRow.score_info;
      const newAnnotations = updates.annotations !== undefined ? JSON.stringify(updates.annotations) : docRow.annotations;
      const newChats = updates.chats !== undefined ? JSON.stringify(updates.chats) : docRow.chats;
      const newHistoryIndex = updates.historyIndex !== undefined ? updates.historyIndex : docRow.history_index;

      this.db.prepare(`
        UPDATE documents
        SET name = ?, title = ?, abc_source = ?, score_info = ?, annotations = ?, chats = ?, history_index = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(newName, newTitle, newAbcSource, newScoreInfo, newAnnotations, newChats, newHistoryIndex, nextRevision, now, documentId);

      if (Array.isArray(updates.versions)) {
        this.db.prepare('DELETE FROM document_versions WHERE document_id = ?').run(documentId);
        const insertVersion = this.db.prepare(`
          INSERT INTO document_versions (document_id, revision, abc_source, created_at, reason)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const v of updates.versions) {
          insertVersion.run(documentId, v.revision, v.abcSource || '', v.createdAt || now, v.reason || 'edit');
        }
      } else if (updates.abcSource !== undefined && updates.abcSource !== docRow.abc_source) {
        this.db.prepare(`
          INSERT OR REPLACE INTO document_versions (document_id, revision, abc_source, created_at, reason)
          VALUES (?, ?, ?, ?, ?)
        `).run(documentId, nextRevision, newAbcSource, now, updates.versionReason || 'edit');
      }

      if (Array.isArray(updates.history)) {
        this.db.prepare('DELETE FROM document_history WHERE document_id = ?').run(documentId);
        const insertHist = this.db.prepare(`
          INSERT INTO document_history (id, document_id, revision, timestamp, category, action_type, summary, abc_source, score_info, annotations, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        updates.history.forEach((h, idx) => {
          insertHist.run(
            h.id || generateHistoryId(),
            documentId,
            h.revision || nextRevision,
            h.timestamp || now,
            h.category || 'body',
            h.actionType || 'edit',
            h.summary || 'Edit score',
            h.abcSource || newAbcSource,
            JSON.stringify(h.scoreInfo || {}),
            JSON.stringify(h.annotations || []),
            idx,
          );
        });
      }

      this.db.prepare(`
        UPDATE workspace SET revision = revision + 1 WHERE id = 1
      `).run();

      this.db.exec('COMMIT;');
      updatedDoc = this.requireSync(documentId);
    } catch (err) {
      if (!(err instanceof PluginError)) {
        try { this.db.exec('ROLLBACK;'); } catch {}
        throw new PluginError('PERSISTENCE_FAILED', `Failed to update score: ${err.message}`);
      }
      throw err;
    }

    if (updates.abcSource !== undefined) {
      await this.mirrorAbcFile(documentId, updatedDoc.abcSource);
    }

    if (this.views) {
      if (updates.abcSource !== undefined) {
        this.views.broadcastCommand({
          kind: 'replace-score',
          documentId,
          replacementAbc: updatedDoc.abcSource,
          revision: updatedDoc.revision,
        });
      }
      if (updates.annotations !== undefined) {
        this.views.broadcastCommand({
          kind: 'annotations',
          documentId,
          annotations: updatedDoc.annotations,
          revision: updatedDoc.revision,
        });
      }
      this.views.broadcastCommand({
        type: 'SCORE_UPDATED',
        documentId,
        revision: updatedDoc.revision,
      });
    }

    return updatedDoc;
  }

  async delete(documentId) {
    return this.serializeMutation(() => this.deleteUnsafe(documentId));
  }

  async deleteUnsafe(documentId) {
    this.db.exec('BEGIN IMMEDIATE;');
    let remainingCount = 0;
    try {
      const doc = this.db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
      if (!doc) {
        this.db.exec('ROLLBACK;');
        throw new PluginError('DOCUMENT_NOT_FOUND', `Score document "${documentId}" was not found.`);
      }

      this.db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
      this.db.prepare('UPDATE workspace SET revision = revision + 1 WHERE id = 1').run();
      const countRow = this.db.prepare('SELECT COUNT(*) as count FROM documents').get();
      remainingCount = countRow?.count ?? 0;

      this.db.exec('COMMIT;');
    } catch (err) {
      if (!(err instanceof PluginError)) {
        try { this.db.exec('ROLLBACK;'); } catch {}
        throw new PluginError('PERSISTENCE_FAILED', `Failed to delete score: ${err.message}`);
      }
      throw err;
    }

    await this.unmirrorAbcFile(documentId);

    if (this.views) {
      this.views.broadcastCommand({
        type: 'FILE_DELETED',
        documentId,
      });
    }

    return { deleted: true, documentId, remainingCount };
  }

  getWorkspaceSync() {
    const wsRow = this.db.prepare('SELECT revision, preferences FROM workspace WHERE id = 1').get();
    const documents = this.listSync();
    return {
      revision: wsRow?.revision ?? 0,
      documents,
      preferences: parseJson(wsRow?.preferences, {}),
    };
  }

  async getWorkspace() {
    return this.getWorkspaceSync();
  }

  async putWorkspace(input) {
    return this.serializeMutation(() => this.putWorkspaceUnsafe(input));
  }

  async putWorkspaceUnsafe({ documents, preferences }) {
    if (!Array.isArray(documents) || !documents.every((d) => d && typeof d.id === 'string' && typeof d.abcSource === 'string')) {
      throw new PluginError('INVALID_WORKSPACE', 'Workspace documents must contain an ID and ABC source.');
    }

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const wsRow = this.db.prepare('SELECT revision, preferences FROM workspace WHERE id = 1').get();
      const currentRevision = wsRow?.revision ?? 0;
      const nextRevision = currentRevision + 1;
      const nextPreferences = preferences && typeof preferences === 'object' ? preferences : parseJson(wsRow?.preferences, {});

      const existingIds = new Set(this.db.prepare('SELECT id FROM documents').all().map((r) => r.id));
      const newDocIds = new Set(documents.map((d) => d.id));

      for (const id of existingIds) {
        if (!newDocIds.has(id)) {
          this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
        }
      }

      const upsertDoc = this.db.prepare(`
        INSERT INTO documents (id, name, title, source_type, revision, abc_source, score_info, annotations, chats, history_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          title = excluded.title,
          source_type = excluded.source_type,
          revision = excluded.revision,
          abc_source = excluded.abc_source,
          score_info = excluded.score_info,
          annotations = excluded.annotations,
          chats = excluded.chats,
          history_index = excluded.history_index,
          updated_at = excluded.updated_at
      `);

      this.db.prepare('DELETE FROM workspace_documents').run();
      const insertOrder = this.db.prepare('INSERT INTO workspace_documents (document_id, sort_order) VALUES (?, ?)');

      const now = new Date().toISOString();
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const safeTitle = doc.title || doc.scoreInfo?.title || doc.name || 'Untitled score';
        upsertDoc.run(
          doc.id,
          doc.name || `${safeTitle}.abc`,
          safeTitle,
          doc.sourceType || 'abc',
          doc.revision || 1,
          doc.abcSource,
          JSON.stringify(doc.scoreInfo || {}),
          JSON.stringify(doc.annotations || []),
          JSON.stringify(doc.chats || []),
          doc.historyIndex || 0,
          doc.createdAt || now,
          doc.updatedAt || now,
        );
        insertOrder.run(doc.id, i);

        if (Array.isArray(doc.versions)) {
          this.db.prepare('DELETE FROM document_versions WHERE document_id = ?').run(doc.id);
          const insVer = this.db.prepare('INSERT INTO document_versions (document_id, revision, abc_source, created_at, reason) VALUES (?, ?, ?, ?, ?)');
          for (const v of doc.versions) {
            insVer.run(doc.id, v.revision, v.abcSource || '', v.createdAt || now, v.reason || 'edit');
          }
        }

        if (Array.isArray(doc.history)) {
          this.db.prepare('DELETE FROM document_history WHERE document_id = ?').run(doc.id);
          const insHist = this.db.prepare('INSERT INTO document_history (id, document_id, revision, timestamp, category, action_type, summary, abc_source, score_info, annotations, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          doc.history.forEach((h, idx) => {
            insHist.run(
              h.id || generateHistoryId(),
              doc.id,
              h.revision || 1,
              h.timestamp || now,
              h.category || 'origin',
              h.actionType || 'initial',
              h.summary || 'History entry',
              h.abcSource || doc.abcSource,
              JSON.stringify(h.scoreInfo || {}),
              JSON.stringify(h.annotations || []),
              idx,
            );
          });
        }
      }

      this.db.prepare(`
        UPDATE workspace SET revision = ?, preferences = ? WHERE id = 1
      `).run(nextRevision, JSON.stringify(nextPreferences));

      this.db.exec('COMMIT;');
    } catch (err) {
      if (!(err instanceof PluginError)) {
        try { this.db.exec('ROLLBACK;'); } catch {}
        throw new PluginError('PERSISTENCE_FAILED', `Failed to update workspace: ${err.message}`);
      }
      throw err;
    }

    for (const doc of documents) {
      if (doc.id && doc.abcSource) {
        await this.mirrorAbcFile(doc.id, doc.abcSource);
      }
    }

    return this.getWorkspace();
  }

  async patchWorkspace({ kind, key, value }) {
    return this.serializeMutation(async () => {
      const current = await this.getWorkspace();
      if (kind === 'documents') {
        return this.putWorkspaceUnsafe({ ...current, documents: value });
      }
      if (kind === 'active') {
        // Active file is browser/tab-local; no-op for backward compatibility
        return current;
      }
      if (kind === 'preference' && key) {
        const preferences = { ...(current.preferences || {}), [key]: value };
        return this.putWorkspaceUnsafe({ ...current, preferences });
      }
      throw new PluginError('INVALID_WORKSPACE', `Unknown patch kind: ${kind}`);
    });
  }
}
