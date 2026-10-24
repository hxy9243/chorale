// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_TRACE_SCHEMA_VERSION,
  JSONLAgentTraceStore,
} from '../../../electron/ai/agentTrace';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('JSONLAgentTraceStore', () => {
  it('writes ordered, newline-delimited records with restrictive file permissions', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-agent-trace-'));
    directories.push(directory);
    const store = new JSONLAgentTraceStore(path.join(directory, 'traces'));
    const trace = await store.createRun(
      'request:one',
      (serialized) => serialized.replaceAll('secret-value', '[redacted]'),
    );

    await Promise.all([
      trace.append('run-start', { systemPrompt: 'Tutor', apiKey: 'secret-value' }),
      trace.append('agent-event', {
        values: new Set(['harmony']),
        measures: new Map([[1, 'C major']]),
        count: 12n,
      }),
      trace.append('run-end', { status: 'complete' }),
    ]);
    await trace.close();

    const serialized = await readFile(trace.filePath, 'utf8');
    const records = serialized.trimEnd().split('\n').map((line) => JSON.parse(line));
    expect(records.map((record) => record.sequence)).toEqual([0, 1, 2]);
    expect(records.map((record) => record.event)).toEqual([
      'run-start',
      'agent-event',
      'run-end',
    ]);
    expect(records[0]).toMatchObject({
      schemaVersion: AGENT_TRACE_SCHEMA_VERSION,
      requestId: 'request:one',
      data: { apiKey: '[redacted]' },
    });
    expect(records[1].data).toEqual({
      values: ['harmony'],
      measures: { 1: 'C major' },
      count: '12',
    });
    expect(serialized).not.toContain('secret-value');
    if (process.platform !== 'win32') {
      expect((await stat(trace.filePath)).mode & 0o777).toBe(0o600);
    }
  });
});
