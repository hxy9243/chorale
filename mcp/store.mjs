import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { measureBodies } from './utils/measure-ops.mjs';

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

export class LocalDocumentStore {
  constructor(options = {}) {
    this.choraleDir = resolve(options.baseDir || process.env.CHORALE_HOME || join(homedir(), '.chorale'));
    this.storePath = resolve(options.storePath || process.env.CHORALE_STORE_PATH || join(this.choraleDir, 'store.json'));
    this.scoresDir = join(this.choraleDir, 'scores');
    this.views = options.views || null;
    this.mutationTail = Promise.resolve();
  }

  setViews(views) {
    this.views = views;
  }

  async read() {
    try {
      const content = await readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.documents)) {
        throw new PluginError('PERSISTENCE_FAILED', 'The local Chorale store has an unsupported format.');
      }
      const workspace = parsed.workspace || { documents: [], activeFileId: '', preferences: {} };
      const documents = Array.isArray(workspace.documents) && workspace.documents.length > 0 ? workspace.documents : parsed.documents;
      return {
        ...parsed,
        documents,
        workspaceRevision: parsed.workspaceRevision || 0,
        workspace: { ...workspace, documents },
      };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        const initial = {
          schemaVersion: 1,
          documents: [],
          workspaceRevision: 0,
          workspace: { documents: [], activeFileId: '', preferences: {} },
        };
        await this.write(initial);
        return initial;
      }
      if (error instanceof PluginError) throw error;
      throw new PluginError('PERSISTENCE_FAILED', `The local Chorale store could not be read: ${error.message}`);
    }
  }

  async write(state) {
    await mkdir(dirname(this.storePath), { recursive: true });
    await mkdir(this.scoresDir, { recursive: true });
    state.workspace = { ...(state.workspace || {}), documents: state.documents || [] };
    const temporaryPath = `${this.storePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    await rename(temporaryPath, this.storePath);

    // Also mirror individual .abc files into ~/.chorale/scores/
    for (const doc of state.documents || []) {
      if (doc.id && doc.abcSource) {
        const safeName = `${doc.id}.abc`;
        try {
          await writeFile(join(this.scoresDir, safeName), doc.abcSource, 'utf8');
        } catch {
          // Non-critical mirror failure
        }
      }
    }
  }

  async list() {
    return (await this.read()).documents;
  }

  async require(documentId) {
    const documents = await this.list();
    const found = documents.find((doc) => doc.id === documentId);
    if (!found) {
      throw new PluginError('DOCUMENT_NOT_FOUND', `Score document "${documentId}" was not found.`);
    }
    return found;
  }

  async create({ title = 'Untitled score', abcSource = '', composer = 'Anonymous', meter = '4/4', key = 'C' }) {
    const documentId = `score-${randomUUID().slice(0, 8)}`;
    const source = abcSource.trim() || defaultPianoTemplate(title, composer, meter, key);
    const now = new Date().toISOString();
    const safeTitle = title || 'Untitled score';
    const name = safeTitle.endsWith('.abc') ? safeTitle : `${safeTitle}.abc`;
    const document = {
      id: documentId,
      name,
      title: safeTitle,
      sourceType: 'abc',
      scoreInfo: { title: safeTitle, composer, meter, key },
      revision: 1,
      abcSource: source,
      annotations: [],
      chats: [],
      versions: [{ revision: 1, abcSource: source, createdAt: now, reason: 'import' }],
      history: [{ id: `hist-${randomUUID().slice(0, 8)}`, revision: 1, timestamp: now, category: 'origin', actionType: 'initial', summary: `Initial score: ${safeTitle}`, abcSource: source, scoreInfo: { title: safeTitle, composer, meter, key }, annotations: [] }],
      historyIndex: 0,
      createdAt: now,
      updatedAt: now,
    };

    const state = await this.read();
    state.documents.push(document);
    state.workspace.documents = state.documents;
    if (!state.workspace.activeFileId) {
      state.workspace.activeFileId = documentId;
    }
    state.workspaceRevision = (state.workspaceRevision || 0) + 1;
    await this.write(state);

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
    const state = await this.read();
    const index = state.documents.findIndex((doc) => doc.id === documentId);
    if (index === -1) {
      throw new PluginError('DOCUMENT_NOT_FOUND', `Score document "${documentId}" was not found.`);
    }

    const current = state.documents[index];
    if (updates.expectedRevision !== undefined && updates.expectedRevision !== current.revision) {
      throw new PluginError(
        'REVISION_CONFLICT',
        `Score "${documentId}" is at revision ${current.revision}, but expected revision was ${updates.expectedRevision}.`,
      );
    }

    const updatedDoc = {
      ...current,
      ...updates,
      revision: (current.revision || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    delete updatedDoc.expectedRevision;

    state.documents[index] = updatedDoc;
    state.workspace.documents = state.documents;
    state.workspaceRevision = (state.workspaceRevision || 0) + 1;
    await this.write(state);

    if (this.views) {
      this.views.broadcastCommand({
        type: 'SCORE_UPDATED',
        documentId,
        revision: updatedDoc.revision,
      });
    }

    return updatedDoc;
  }

  async delete(documentId) {
    const state = await this.read();
    const initialLen = state.documents.length;
    state.documents = state.documents.filter((doc) => doc.id !== documentId);
    if (state.documents.length === initialLen) {
      throw new PluginError('DOCUMENT_NOT_FOUND', `Score document "${documentId}" was not found.`);
    }

    if (state.workspace.activeFileId === documentId) {
      state.workspace.activeFileId = state.documents[0]?.id || '';
    }
    state.workspace.documents = state.documents;
    state.workspaceRevision = (state.workspaceRevision || 0) + 1;
    await this.write(state);

    try {
      await unlink(join(this.scoresDir, `${documentId}.abc`));
    } catch {
      // Ignored if missing
    }

    if (this.views) {
      this.views.broadcastCommand({
        type: 'FILE_DELETED',
        documentId,
      });
    }

    return { deleted: true, documentId, remainingCount: state.documents.length };
  }

  async getWorkspace() {
    const state = await this.read();
    return { revision: state.workspaceRevision || 0, ...state.workspace };
  }

  async putWorkspace({ documents, activeFileId, preferences, expectedRevision }) {
    if (!Array.isArray(documents) || !documents.every((d) => d && typeof d.id === 'string' && typeof d.abcSource === 'string')) {
      throw new PluginError('INVALID_WORKSPACE', 'Workspace documents must contain an ID and ABC source.');
    }
    const state = await this.read();
    if (expectedRevision !== undefined && expectedRevision !== state.workspaceRevision) {
      throw new PluginError('REVISION_CONFLICT', `Workspace is at revision ${state.workspaceRevision}, not ${expectedRevision}.`);
    }
    state.workspace = {
      documents,
      activeFileId: typeof activeFileId === 'string' ? activeFileId : state.workspace.activeFileId || '',
      preferences: preferences && typeof preferences === 'object' ? preferences : state.workspace.preferences || {},
    };
    state.documents = documents;
    state.workspaceRevision = (state.workspaceRevision || 0) + 1;
    await this.write(state);
    return { revision: state.workspaceRevision, ...state.workspace };
  }

  async patchWorkspace({ kind, key, value, expectedRevision }) {
    const run = async () => {
      const current = await this.getWorkspace();
      if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new PluginError('REVISION_CONFLICT', `Workspace revision conflict: expected ${expectedRevision}, found ${current.revision}`);
      }
      if (kind === 'documents') {
        return this.putWorkspace({ ...current, documents: value, expectedRevision });
      }
      if (kind === 'active') {
        return this.putWorkspace({ ...current, activeFileId: value, expectedRevision });
      }
      if (kind === 'preference' && key) {
        const preferences = { ...(current.preferences || {}), [key]: value };
        return this.putWorkspace({ ...current, preferences, expectedRevision });
      }
      throw new PluginError('INVALID_WORKSPACE', `Unknown patch kind: ${kind}`);
    };

    const nextTail = this.mutationTail.then(run, run);
    this.mutationTail = nextTail.catch(() => {});
    return nextTail;
  }
}
