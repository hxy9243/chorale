import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScoreImportJob, ScoreScanResult } from '../src/types/scoreScan';
import { ScoreScanner, validateScanRequest } from './scoreScan';

/** Durable job entries belong to the native process, not the setup dialog. */
export class ScanJobs {
  private readonly jobs = new Map<string, ScoreImportJob>();
  private readonly ready: Promise<void>;
  private running = false;
  private closed = false;
  private submitting = 0;
  private readonly writes = new Map<string, Promise<void>>();

  private readonly scanner: ScoreScanner;
  constructor(scanner: ScoreScanner) { this.scanner = scanner; this.ready = this.restore(); }

  private file(id: string, name: string) { return path.join(this.scanner.sourceFolder(id), name); }

  private async save(job: ScoreImportJob) {
    const snapshot = JSON.stringify(job);
    const pending = (this.writes.get(job.id) || Promise.resolve()).catch(() => {}).then(async () => {
      const file = this.file(job.id, 'background-job.json');
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, snapshot);
      await rename(temporary, file);
    });
    this.writes.set(job.id, pending);
    try { await pending; } finally { if (this.writes.get(job.id) === pending) this.writes.delete(job.id); }
  }

  private async restore() {
    for (const id of await readdir(this.scanner.root).catch(() => [] as string[])) {
      try {
        const job: ScoreImportJob = JSON.parse(await readFile(this.file(id, 'background-job.json'), 'utf8'));
        if (job.id !== id || typeof job.title !== 'string' || typeof job.sourceName !== 'string' || typeof job.createdAt !== 'string'
          || !['copisteria', 'audiveris'].includes(job.engine) || !Array.isArray(job.pages) || !job.pages.length
          || job.pages.length > 60 || job.pages.some((page) => !Number.isInteger(page) || page < 1 || page > 10000)
          || !['queued', 'importing', 'recognized', 'failed', 'cancelled'].includes(job.state)) continue;
        if (job.state === 'queued' || job.state === 'importing') {
          job.state = 'failed';
          job.error = 'Import was interrupted when Chorale closed. Start a new import to try again.';
          await this.save(job);
        }
        this.jobs.set(id, job);
      } catch { /* Unrelated, deleted or incomplete job artifacts are not entries. */ }
    }
  }

  async list(): Promise<ScoreImportJob[]> {
    await this.ready;
    return [...this.jobs.values()].map((job) => ({ ...job, pages: [...job.pages] })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async start(request: unknown): Promise<ScoreImportJob> {
    await this.ready;
    if (this.closed) throw new Error('The scanner is closing. Reopen Chorale to import.');
    if ([...this.jobs.values()].filter((job) => job.state === 'queued' || job.state === 'importing').length + this.submitting >= 10) {
      throw new Error('Ten imports are already queued. Wait for one to finish.');
    }
    this.submitting++;
    try {
      const input = validateScanRequest(request);
      const id = randomUUID();
      const job: ScoreImportJob = { id, title: input.name.replace(/\.(pdf|png)$/i, ''), sourceName: input.name,
        engine: input.engine, pages: input.pages, state: 'queued', createdAt: new Date().toISOString(), sourceAvailable: true };
      await mkdir(this.scanner.sourceFolder(id), { recursive: true });
      await writeFile(this.file(id, `source${input.extension}`), input.bytes);
      await this.save(job);
      this.jobs.set(id, job);
      void this.drain();
      return { ...job };
    } finally { this.submitting--; }
  }

  private async drain() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      for (;;) {
        const job = [...this.jobs.values()].find((item) => item.state === 'queued');
        if (!job || this.closed) break;
        try {
          job.state = 'importing'; job.startedAt = new Date().toISOString();
          await this.save(job);
          const source = this.file(job.id, /\.png$/i.test(job.sourceName) ? 'source.png' : 'source.pdf');
          if ((await stat(source)).size > 20 * 1024 * 1024) throw new Error('The original exceeds the import size limit.');
          const bytes = await readFile(source);
          if (this.jobs.get(job.id)?.state === 'cancelled' || this.closed) continue;
          const result = await this.scanner.scan({ name: job.sourceName,
            bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            pages: job.pages.join(','), engine: job.engine }, job.id);
          if (this.jobs.get(job.id)?.state === 'cancelled' || this.closed) continue;
          await writeFile(this.file(job.id, 'background-result.json'), JSON.stringify(result));
          if (this.jobs.get(job.id)?.state === 'cancelled' || this.closed) continue;
          job.state = 'recognized';
        } catch (error) {
          if (this.jobs.get(job.id)?.state !== 'cancelled') {
            job.state = 'failed';
            job.error = error instanceof Error ? error.message : 'Recognition failed.';
          }
        }
        await this.save(job).catch(() => { job.state = 'failed'; job.error = 'The import status could not be saved. Check available disk space.'; });
      }
    } finally { this.running = false; }
  }

  async result(id: string): Promise<ScoreScanResult> {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.state !== 'recognized') throw new Error('This import is not ready.');
    const file = this.file(id, 'background-result.json');
    if ((await stat(file)).size > 40 * 1024 * 1024) throw new Error('The import result is too large.');
    const result: ScoreScanResult = JSON.parse(await readFile(file, 'utf8'));
    if (result.jobId !== id) throw new Error('The import result does not match this job.');
    return result;
  }

  async fail(id: string, message: string) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.state !== 'recognized' || typeof message !== 'string') throw new Error('This import is not ready.');
    job.state = 'failed'; job.error = message.slice(0, 2000);
    await this.save(job);
  }

  async cancel(id: string) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || !['queued', 'importing', 'recognized'].includes(job.state)) return;
    const active = job.state === 'importing';
    job.state = 'cancelled'; job.error = 'Import cancelled. Your original file is preserved.';
    if (active) this.scanner.cancel();
    await this.save(job);
  }

  async dismiss(id: string) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.state === 'queued' || job.state === 'importing') throw new Error('Cancel this import before removing it.');
    await this.writes.get(id);
    await unlink(this.file(id, 'background-job.json'));
    this.jobs.delete(id);
  }

  close() { this.closed = true; this.scanner.cancel(); }
}
