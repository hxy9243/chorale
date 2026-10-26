// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ScanJobs } from '../../../electron/scanJobs';
import type { ScoreScanner } from '../../../electron/scoreScan';
import type { ScoreScanResult } from '../../types/scoreScan';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const request = { name: 'Piano.pdf', bytes: new TextEncoder().encode('%PDF-1.4 fixture').buffer, pages: '1-7' };
const fixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chorale-background-')); roots.push(root);
  const finishes: ((result: ScoreScanResult) => void)[] = [];
  const scanner = { root, sourceFolder: (id: string) => { if (!/^[a-f\d-]{36}$/.test(id)) throw new Error('Bad ID'); return path.join(root, id); },
    scan: vi.fn((_request: unknown, id: string) => new Promise<ScoreScanResult>((done) => { finishes.push((result) => done({ ...result, jobId: id })); })), cancel: vi.fn() };
  return { root, scanner, finishes, jobs: new ScanJobs(scanner as unknown as ScoreScanner) };
};
const result = { jobId: '', sourceName: request.name, sourceFolder: '/tmp/source', musicXml: '<score-partwise/>', pages: [1], images: [], warnings: [], elapsedMs: 1 };

describe('durable background scan jobs', () => {
  it('acknowledges before recognition, queues serially and preserves original bytes', async () => {
    const { jobs, scanner, finishes, root } = await fixture();
    const first = await jobs.start(request); const next = await jobs.start({ ...request, name: 'Chorale.pdf' });
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledOnce());
    expect((await jobs.list()).find((job) => job.id === next.id)?.state).toBe('queued');
    expect(await readFile(path.join(root, first.id, 'source.pdf'))).toEqual(Buffer.from(request.bytes));
    finishes[0](result);
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledTimes(2));
    expect((await jobs.result(first.id)).jobId).toBe(first.id);
    finishes[1](result);
    await vi.waitFor(async () => expect((await jobs.list()).every((job) => job.state === 'recognized')).toBe(true));
    await jobs.dismiss(first.id);
    expect(await readFile(path.join(root, first.id, 'source.pdf'))).toEqual(Buffer.from(request.bytes));
    const restored = new ScanJobs(scanner as unknown as ScoreScanner);
    expect((await restored.list()).map((job) => job.id)).toEqual([next.id]);
    expect((await restored.result(next.id)).jobId).toBe(next.id);
  });
  it('cancels queued jobs without killing the active job and ignores late active results', async () => {
    const { jobs, scanner, finishes, root } = await fixture();
    const first = await jobs.start(request); const next = await jobs.start(request);
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledOnce());
    await jobs.cancel(next.id); expect(scanner.cancel).not.toHaveBeenCalled();
    await jobs.cancel(first.id); expect(scanner.cancel).toHaveBeenCalledOnce();
    finishes[0](result);
    await vi.waitFor(async () => expect(JSON.parse(await readFile(path.join(root, first.id, 'background-job.json'), 'utf8')).state).toBe('cancelled'));
    await expect(jobs.result(first.id)).rejects.toThrow('not ready');
    expect(scanner.scan).toHaveBeenCalledOnce();
  });
  it('bounds queued uploads without accepting an eleventh active import', async () => {
    const { jobs, scanner, finishes } = await fixture();
    for (let index = 0; index < 10; index++) await jobs.start(request);
    await expect(jobs.start(request)).rejects.toThrow('Ten imports');
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledOnce());
    for (const job of await jobs.list()) await jobs.cancel(job.id);
    finishes[0](result);
    expect((await jobs.list()).every((job) => job.state === 'cancelled')).toBe(true);
  });
  it('marks jobs interrupted by app shutdown as failed after restart', async () => {
    const { jobs, scanner, finishes } = await fixture();
    const job = await jobs.start(request);
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledOnce());
    jobs.close(); finishes[0](result);
    const restored = new ScanJobs(scanner as unknown as ScoreScanner);
    expect((await restored.list()).find((entry) => entry.id === job.id)).toMatchObject({ state: 'failed', error: expect.stringContaining('interrupted') });
  });
  it('keeps conversion failures visible and can cancel a recognized result before conversion', async () => {
    const { jobs, scanner, finishes } = await fixture();
    const job = await jobs.start(request);
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledOnce()); finishes[0](result);
    await vi.waitFor(async () => expect((await jobs.list())[0].state).toBe('recognized'));
    await jobs.fail(job.id, 'Could not convert this score.');
    expect((await jobs.list())[0]).toMatchObject({ state: 'failed', sourceAvailable: true });
    const next = await jobs.start(request);
    await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledTimes(2)); finishes[1](result);
    await vi.waitFor(async () => expect((await jobs.list()).find((entry) => entry.id === next.id)?.state).toBe('recognized'));
    await jobs.cancel(next.id);
    await expect(jobs.result(next.id)).rejects.toThrow('not ready');
  });
});
