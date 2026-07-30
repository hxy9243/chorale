import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Credential } from '@earendil-works/pi-ai';
import { isAIProviderKind } from '../../src/agent/aiTypes';
import type {
  AIConnectionPublic,
  AIConnectionStatus,
  AIModelOption,
  AIProviderKind,
  AISelection,
  SaveAIConnectionInput,
} from '../../src/agent/aiTypes';

export type ConnectionSecret = {
  apiKey?: string;
  headers?: Record<string, string>;
  credential?: Credential;
};

export type SecretCipher = {
  isAvailable(): Promise<boolean>;
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<{ value: string; shouldReEncrypt: boolean }>;
};

type StoredConnection = {
  id: string;
  name: string;
  kind: AIProviderKind;
  baseUrl?: string;
  authType: 'api-key' | 'oauth';
  status: AIConnectionStatus;
  lastValidatedAt?: string;
  modelsUpdatedAt?: string;
  models: AIModelOption[];
  encryptedSecret?: string;
};

type StoredFile = {
  version: 1;
  selection: AISelection | null;
  connections: StoredConnection[];
};

type ConnectionRecord = StoredConnection & {
  secret?: ConnectionSecret;
  persistence: 'encrypted' | 'session-only';
};

const EMPTY_FILE: StoredFile = {
  version: 1,
  selection: null,
  connections: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isSelection = (value: unknown): value is AISelection => (
  isRecord(value) &&
  typeof value.connectionId === 'string' &&
  typeof value.modelId === 'string'
);

const CONNECTION_STATUSES = new Set<AIConnectionStatus>([
  'ready',
  'invalid',
  'expired',
  'unavailable',
]);

const isModelOption = (value: unknown): value is AIModelOption => (
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  (value.source === 'live' || value.source === 'pi-catalog') &&
  (value.contextWindow === undefined || typeof value.contextWindow === 'number') &&
  (value.maxTokens === undefined || typeof value.maxTokens === 'number') &&
  (value.reasoning === undefined || typeof value.reasoning === 'boolean')
);

const isStoredConnection = (value: unknown): value is StoredConnection => (
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  isAIProviderKind(value.kind) &&
  (value.baseUrl === undefined || typeof value.baseUrl === 'string') &&
  (value.authType === 'api-key' || value.authType === 'oauth') &&
  typeof value.status === 'string' &&
  CONNECTION_STATUSES.has(value.status as AIConnectionStatus) &&
  (value.lastValidatedAt === undefined || typeof value.lastValidatedAt === 'string') &&
  (value.modelsUpdatedAt === undefined || typeof value.modelsUpdatedAt === 'string') &&
  Array.isArray(value.models) &&
  value.models.every(isModelOption) &&
  (value.encryptedSecret === undefined || typeof value.encryptedSecret === 'string')
);

const isConnectionSecret = (value: unknown): value is ConnectionSecret => (
  isRecord(value) &&
  (value.apiKey === undefined || typeof value.apiKey === 'string') &&
  (
    value.headers === undefined ||
    (
      isRecord(value.headers) &&
      Object.values(value.headers).every((header) => typeof header === 'string')
    )
  ) &&
  (value.credential === undefined || isRecord(value.credential))
);

const parseStoredFile = (raw: string): StoredFile => {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.connections)) {
    throw new Error('Unsupported AI connection store format.');
  }

  const connections = parsed.connections.filter(isStoredConnection);

  return {
    version: 1,
    selection: isSelection(parsed.selection) ? parsed.selection : null,
    connections,
  };
};

export class AIConnectionStore {
  private readonly records = new Map<string, ConnectionRecord>();
  private selection: AISelection | null = null;
  private writeChain: Promise<unknown> = Promise.resolve();
  private encryptionAvailable = false;
  private readonly dataDirectory: string;
  private readonly cipher: SecretCipher;

  constructor(
    dataDirectory: string,
    cipher: SecretCipher,
  ) {
    this.dataDirectory = dataDirectory;
    this.cipher = cipher;
  }

  private get filePath() {
    return path.join(this.dataDirectory, 'ai-connections.v1.json');
  }

  async initialize() {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    this.encryptionAvailable = await this.cipher.isAvailable();

    let stored = EMPTY_FILE;
    try {
      stored = parseStoredFile(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('Could not load AI connection store:', error);
      }
    }

    this.selection = stored.selection;
    let needsRewrite = false;
    for (const connection of stored.connections) {
      let secret: ConnectionSecret | undefined;
      if (connection.encryptedSecret && this.encryptionAvailable) {
        try {
          const decrypted = await this.cipher.decrypt(connection.encryptedSecret);
          const parsedSecret = JSON.parse(decrypted.value) as unknown;
          if (!isConnectionSecret(parsedSecret)) {
            throw new Error('Encrypted connection credentials have an invalid shape.');
          }
          secret = parsedSecret;
          needsRewrite ||= decrypted.shouldReEncrypt;
        } catch (error) {
          console.warn(`Could not decrypt AI connection ${connection.id}:`, error);
        }
      }

      this.records.set(connection.id, {
        ...connection,
        secret,
        persistence: secret && this.encryptionAvailable ? 'encrypted' : 'session-only',
        status: secret ? connection.status : 'unavailable',
      });
    }

    const selectedRecord = this.selection
      ? this.records.get(this.selection.connectionId)
      : undefined;
    if (
      this.selection &&
      (
        !selectedRecord ||
        !selectedRecord.models.some((model) => model.id === this.selection?.modelId)
      )
    ) {
      this.selection = null;
      needsRewrite = true;
    }
    if (needsRewrite) await this.persist();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(task, task);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private toPublic(record: ConnectionRecord): AIConnectionPublic {
    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      baseUrl: record.baseUrl,
      authType: record.authType,
      persistence: record.persistence,
      status: record.status,
      lastValidatedAt: record.lastValidatedAt,
      modelsUpdatedAt: record.modelsUpdatedAt,
    };
  }

  listConnections(): AIConnectionPublic[] {
    return [...this.records.values()]
      .map((record) => this.toPublic(record))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getConnection(id: string): AIConnectionPublic | undefined {
    const record = this.records.get(id);
    return record ? this.toPublic(record) : undefined;
  }

  getSecret(id: string): ConnectionSecret | undefined {
    const secret = this.records.get(id)?.secret;
    return secret ? structuredClone(secret) : undefined;
  }

  async saveConnection(input: SaveAIConnectionInput): Promise<AIConnectionPublic> {
    return this.enqueue(async () => {
      const id = input.id || randomUUID();
      const existing = this.records.get(id);
      if (existing?.kind === 'openai-codex') {
        throw new Error('OpenAI Codex connections must be created through OAuth.');
      }

      const apiKey = input.apiKey?.trim() || existing?.secret?.apiKey;
      if (!apiKey) throw new Error('An API key is required.');

      const record: ConnectionRecord = {
        id,
        name: input.name.trim(),
        kind: input.kind,
        baseUrl: input.baseUrl?.trim() || undefined,
        authType: 'api-key',
        persistence: this.encryptionAvailable ? 'encrypted' : 'session-only',
        status: 'ready',
        lastValidatedAt: existing?.lastValidatedAt,
        modelsUpdatedAt: existing?.modelsUpdatedAt,
        models: existing?.models ?? [],
        encryptedSecret: existing?.encryptedSecret,
        secret: {
          apiKey,
          headers: input.headers ?? existing?.secret?.headers,
        },
      };
      if (!record.name) throw new Error('A connection name is required.');

      this.records.set(id, record);
      await this.persist();
      return this.toPublic(record);
    });
  }

  async saveOAuthConnection(
    credential: Credential,
    models: AIModelOption[],
  ): Promise<AIConnectionPublic> {
    return this.enqueue(async () => {
      const existingCount = [...this.records.values()]
        .filter((record) => record.kind === 'openai-codex').length;
      const id = randomUUID();
      const now = new Date().toISOString();
      const record: ConnectionRecord = {
        id,
        name: existingCount === 0 ? 'OpenAI Codex' : `OpenAI Codex ${existingCount + 1}`,
        kind: 'openai-codex',
        authType: 'oauth',
        persistence: this.encryptionAvailable ? 'encrypted' : 'session-only',
        status: 'ready',
        lastValidatedAt: now,
        modelsUpdatedAt: now,
        models,
        secret: { credential },
      };
      this.records.set(id, record);
      await this.persist();
      return this.toPublic(record);
    });
  }

  async updateOAuthCredential(id: string, credential: Credential) {
    return this.enqueue(async () => {
      const record = this.records.get(id);
      if (!record || record.kind !== 'openai-codex') {
        throw new Error('OpenAI Codex connection not found.');
      }
      record.secret = { credential };
      record.persistence = this.encryptionAvailable ? 'encrypted' : 'session-only';
      record.status = 'ready';
      await this.persist();
    });
  }

  async updateModels(id: string, models: AIModelOption[]) {
    return this.enqueue(async () => {
      const record = this.records.get(id);
      if (!record) throw new Error('AI connection not found.');
      record.models = models;
      record.modelsUpdatedAt = new Date().toISOString();
      record.lastValidatedAt = record.modelsUpdatedAt;
      record.status = 'ready';
      await this.persist();
    });
  }

  getModels(id: string): AIModelOption[] {
    return [...(this.records.get(id)?.models ?? [])];
  }

  async markStatus(id: string, status: AIConnectionStatus) {
    return this.enqueue(async () => {
      const record = this.records.get(id);
      if (!record) return;
      record.status = status;
      await this.persist();
    });
  }

  getSelection(): AISelection | null {
    return this.selection ? { ...this.selection } : null;
  }

  async setSelection(selection: AISelection | null) {
    return this.enqueue(async () => {
      if (selection) {
        const record = this.records.get(selection.connectionId);
        if (!record) throw new Error('AI connection not found.');
        if (!record.models.some((model) => model.id === selection.modelId)) {
          throw new Error('Selected model is not available for this connection.');
        }
      }
      this.selection = selection ? { ...selection } : null;
      await this.persist();
    });
  }

  async deleteConnection(id: string) {
    return this.enqueue(async () => {
      this.records.delete(id);
      if (this.selection?.connectionId === id) this.selection = null;
      await this.persist();
    });
  }

  private async persist() {
    const connections: StoredConnection[] = [];
    for (const record of this.records.values()) {
      let encryptedSecret = record.encryptedSecret;
      if (record.secret && this.encryptionAvailable) {
        encryptedSecret = await this.cipher.encrypt(JSON.stringify(record.secret));
        record.encryptedSecret = encryptedSecret;
        record.persistence = 'encrypted';
      }

      connections.push({
        id: record.id,
        name: record.name,
        kind: record.kind,
        baseUrl: record.baseUrl,
        authType: record.authType,
        status: record.status,
        lastValidatedAt: record.lastValidatedAt,
        modelsUpdatedAt: record.modelsUpdatedAt,
        models: record.models,
        encryptedSecret,
      });
    }

    const file: StoredFile = {
      version: 1,
      selection: this.selection,
      connections,
    };
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
