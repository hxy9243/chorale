import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const AGENT_TRACE_SCHEMA_VERSION = 1;

export type AgentTraceRecord = Readonly<{
  schemaVersion: typeof AGENT_TRACE_SCHEMA_VERSION;
  sequence: number;
  timestamp: string;
  requestId: string;
  event: string;
  data?: unknown;
}>;

export type AgentTraceRun = Readonly<{
  filePath: string;
  append(event: string, data?: unknown): Promise<void>;
  close(): Promise<void>;
}>;

export type AgentTraceStore = Readonly<{
  directory: string;
  ensureDirectory(): Promise<void>;
  createRun(
    requestId: string,
    redactSerialized?: (serialized: string) => string,
  ): Promise<AgentTraceRun>;
}>;

const safeFilePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const serializeRecord = (record: AgentTraceRecord): string => {
  const seen = new WeakSet<object>();
  return JSON.stringify(record, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    if (value instanceof Set) return [...value];
    if (value instanceof Map) return Object.fromEntries(value);
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
};

export class JSONLAgentTraceStore implements AgentTraceStore {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async ensureDirectory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  async createRun(
    requestId: string,
    redactSerialized: (serialized: string) => string = (serialized) => serialized,
  ): Promise<AgentTraceRun> {
    await this.ensureDirectory();
    const startedAt = new Date();
    const fileName = `${safeFilePart(startedAt.toISOString())}-${safeFilePart(requestId)}.jsonl`;
    const filePath = path.join(this.directory, fileName);
    let sequence = 0;
    let pending = Promise.resolve();
    let warned = false;

    const append = (event: string, data?: unknown) => {
      const record: AgentTraceRecord = {
        schemaVersion: AGENT_TRACE_SCHEMA_VERSION,
        sequence,
        timestamp: new Date().toISOString(),
        requestId,
        event,
        ...(data === undefined ? {} : { data }),
      };
      sequence += 1;
      pending = pending.then(async () => {
        const serialized = redactSerialized(serializeRecord(record));
        await appendFile(filePath, `${serialized}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
      }).catch((error) => {
        if (!warned) {
          warned = true;
          console.warn('Agent trace logging stopped:', error);
        }
      });
      return pending;
    };

    return {
      filePath,
      append,
      close: () => pending,
    };
  }
}
