import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import JSZip from 'jszip';
import type { ScoreScanRequest, ScoreScanResult } from '../src/types/scoreScan';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const parseScanPages = (input: string): number[] => {
  if (!input.trim() || input.length > 80 || !/^[\d,\s-]+$/.test(input)) {
    throw new Error('Choose up to five pages, for example 1 or 1-3.');
  }
  const pages = new Set<number>();
  for (const section of input.split(',')) {
    const match = section.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Invalid page selection. Use numbers such as 1, 3-5.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last > 10000 || last < first || last - first > 4) {
      throw new Error('Choose up to five pages between 1 and 10000.');
    }
    for (let page = first; page <= last; page++) pages.add(page);
    if (pages.size > 5) throw new Error('This trial supports up to five pages per scan.');
  }
  return [...pages].sort((a, b) => a - b);
};

export const validateScanRequest = (value: unknown) => {
  if (!value || typeof value !== 'object') throw new Error('Invalid scan request.');
  const input = value as ScoreScanRequest;
  if (typeof input.name !== 'string' || input.name.length > 200 || [...input.name].some((character) => character.charCodeAt(0) < 32 || /[\\/]/.test(character))) {
    throw new Error('Invalid score file name.');
  }
  // ArrayBuffer arrives through Electron's structured clone, not a file path.
  if (!(input.bytes instanceof ArrayBuffer) || input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_BYTES) {
    throw new Error('Choose a PDF or PNG smaller than 20 MB.');
  }
  const bytes = Buffer.from(input.bytes);
  const extension = path.extname(input.name).toLowerCase();
  if (extension === '.pdf') {
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('This file is not a valid PDF.');
  } else if (extension === '.png') {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('This file is not a valid PNG.');
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > 40_000_000) throw new Error('Choose a PNG smaller than 40 megapixels.');
  } else {
    throw new Error('This trial accepts PDF and PNG files only.');
  }
  if (typeof input.pages !== 'string') throw new Error('Invalid page selection.');
  const pages = extension === '.png' ? [1] : parseScanPages(input.pages);
  return { name: input.name, bytes, extension, pages };
};

const readEntry = (entry: JSZip.JSZipObject, maximumBytes: number): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  // JSZip uses a compatibility stream without native async iteration.
  const stream = entry.nodeStream() as Readable;
  stream.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > maximumBytes) {
      stream.destroy();
      reject(new Error('Recognition output exceeded the preview limit. Choose fewer pages.'));
    } else chunks.push(chunk);
  });
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks)));
});

const collectFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
};

export class ScoreScanner {
  readonly root: string;
  private active: AbortController | null = null;
  private readonly projectDirectory: string;
  private readonly executable?: string;
  private readonly timeoutMs: number;

  constructor(options: { projectDirectory: string; root?: string; executable?: string; timeoutMs?: number }) {
    this.projectDirectory = options.projectDirectory;
    this.root = options.root || path.join(process.env.CHORALE_HOME || path.join(homedir(), '.chorale'), 'imports');
    this.executable = options.executable;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  private async findExecutable() {
    const configured = this.executable || process.env.CHORALE_AUDIVERIS;
    const candidates = configured ? [configured] : [
      path.join(this.projectDirectory, '.local/audiveris/runtime/opt/audiveris/bin/Audiveris'),
      '/Applications/Audiveris.app/Contents/MacOS/Audiveris',
      ...((process.env.PATH || '').split(path.delimiter).flatMap((directory) => [
        path.join(directory, process.platform === 'win32' ? 'Audiveris.exe' : 'audiveris'),
        path.join(directory, 'Audiveris'),
      ])),
    ];
    for (const candidate of candidates) {
      try { await access(candidate, constants.X_OK); if ((await stat(candidate)).isFile()) return candidate; } catch { /* Try the next install. */ }
    }
    return null;
  }

  async status() {
    const available = Boolean(await this.findExecutable());
    return {
      available,
      message: available ? 'Local scanner ready. Your score stays on this computer.'
        : 'Local scanner unavailable. Install Audiveris, then reopen Chorale.',
    };
  }

  cancel() { this.active?.abort(); }

  sourceFolder(jobId: string) {
    if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(jobId)) {
      throw new Error('Invalid scan identifier.');
    }
    return path.join(this.root, jobId);
  }

  async scan(request: unknown): Promise<ScoreScanResult> {
    if (this.active) throw new Error('A scan is already running. Cancel it before starting another.');
    const input = validateScanRequest(request);
    const controller = new AbortController();
    this.active = controller;
    const started = Date.now();
    const jobId = randomUUID();
    const folder = this.sourceFolder(jobId);
    let output = '';
    let processFailure = '';
    let folderCreated = false;
    const manifest = { jobId, sourceName: input.name, sourceSha256: createHash('sha256').update(input.bytes).digest('hex'), pages: input.pages, engine: 'Audiveris', createdAt: new Date().toISOString() };
    try {
      const executable = await this.findExecutable();
      if (!executable) throw new Error((await this.status()).message);
      controller.signal.throwIfAborted();
      await mkdir(folder, { recursive: true });
      folderCreated = true;
      const sourcePath = path.join(folder, `source${input.extension}`);
      await writeFile(sourcePath, input.bytes);
      await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ ...manifest, executable, status: 'scanning' }, null, 2));
      const args = ['-batch', '-transcribe', '-export', '-save', '-sheets', ...input.pages.map(String), '-output', folder, '--', sourcePath];
      const localOcrData = path.join(this.projectDirectory, '.local/audiveris/tessdata');
      const hasLocalOcrData = await access(path.join(localOcrData, 'eng.traineddata')).then(() => true, () => false);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, args, {
          shell: false,
          detached: process.platform !== 'win32',
          windowsHide: true,
          // _JAVA_OPTIONS is applied after the official launcher's -Xmx8G.
          env: {
            ...process.env,
            _JAVA_OPTIONS: '-Xmx1536m -Djava.awt.headless=true',
            ...(hasLocalOcrData && !process.env.TESSDATA_PREFIX ? { TESSDATA_PREFIX: localOcrData } : {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let timedOut = false;
        let exceeded = false;
        let outputBytes = 0;
        const kill = () => {
          if (!child.pid) return;
          try {
            if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
            else child.kill('SIGKILL');
          } catch { child.kill('SIGKILL'); }
        };
        const timer = setTimeout(() => { timedOut = true; kill(); }, this.timeoutMs);
        const append = (chunk: Buffer) => {
          outputBytes += chunk.length;
          if (outputBytes > MAX_OUTPUT_BYTES) { exceeded = true; kill(); }
          else output += chunk.toString();
        };
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        controller.signal.addEventListener('abort', kill, { once: true });
        if (controller.signal.aborted) kill();
        const cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', kill); };
        child.once('error', (error) => { cleanup(); reject(error); });
        child.once('close', (code) => {
          cleanup();
          if (controller.signal.aborted) reject(new Error('Scan cancelled.'));
          else if (timedOut) reject(new Error('Scanning took longer than three minutes. Try one page or a clearer image.'));
          else if (exceeded) reject(new Error('The scanner produced too many diagnostics. Try one page.'));
          else if (code !== 0) reject(new Error('The scanner could not read this score. Try a clear printed page; logs are preserved in the source folder.'));
          else resolve();
        });
      });
      controller.signal.throwIfAborted();
      const files = await collectFiles(folder);
      const exports = files.filter((file) => /\.(mxl|musicxml)$/i.test(file));
      if (exports.length !== 1) throw new Error(exports.length ? 'Several separate scores were found. Select pages from one piece.' : 'No editable music was recognized. Try a clearer page or check the selected pages.');
      if ((await stat(exports[0])).size > MAX_XML_BYTES) throw new Error('Recognition output is too large. Choose fewer pages.');
      const exported = await readFile(exports[0]);
      let musicXml: string;
      if (exports[0].endsWith('.mxl')) {
        const zip = await JSZip.loadAsync(exported);
        const container = zip.file('META-INF/container.xml');
        const containerXml = container ? (await readEntry(container, 64 * 1024)).toString('utf8') : '';
        const rootFile = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/)?.[1];
        const entry = rootFile ? zip.file(rootFile) : Object.values(zip.files).find((file) => !file.dir && !file.name.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(file.name));
        if (!entry) throw new Error('The scanner returned no MusicXML.');
        musicXml = (await readEntry(entry, MAX_XML_BYTES)).toString('utf8');
      } else musicXml = exported.toString('utf8');
      if (!/<score-partwise\b/.test(musicXml) || !/<pitch\b/.test(musicXml)) throw new Error('No pitched notes were recognized. Try a clearer printed score.');
      await writeFile(path.join(folder, 'recognized.musicxml'), musicXml);
      // Audiveris can exit zero after logging an exception during export and
      // still leave an MXL containing only part of the score.
      if (/PartwiseBuilder[^\n]*\bError visiting\b|\bjava\.lang\.(?:NullPointerException|IllegalStateException)\b/.test(output)) {
        throw new Error('The scanner could not finish exporting this page. No score was imported. The original and partial output are preserved; use a corrected MusicXML file instead.');
      }
      if (!/<time\b[^>]*>\s*<beats>[^<]+<\/beats>\s*<beat-type>[1-9]\d*<\/beat-type>\s*<\/time>/.test(musicXml)) {
        throw new Error('The scanner could not determine the time signature. No score was imported. This trial does not support unmetered scan results; use a corrected MusicXML file instead.');
      }
      const images: ScoreScanResult['images'] = [];
      let imageBytes = 0;
      for (const file of files.filter((file) => file.endsWith('.omr'))) {
        if ((await stat(file)).size > 64 * 1024 * 1024) continue;
        const zip = await JSZip.loadAsync(await readFile(file));
        for (const entry of Object.values(zip.files)) {
          const match = entry.name.match(/sheet#(\d+)\/BINARY\.png$/i);
          if (!match || !input.pages.includes(Number(match[1]))) continue;
          const bytes = await readEntry(entry, MAX_PREVIEW_BYTES - imageBytes);
          imageBytes += bytes.length;
          images.push({ page: Number(match[1]), dataUrl: `data:image/png;base64,${bytes.toString('base64')}` });
        }
      }
      if (!images.length && input.extension === '.png') images.push({ page: 1, dataUrl: `data:image/png;base64,${input.bytes.toString('base64')}` });
      const warnings = [...new Set(output.split('\n').filter((line) => /\bWARN\b|\bERROR\b/.test(line)).map((line) => line.trim()))].slice(0, 20);
      if (/no correct rhythm|No timeOffset/.test(output)) warnings.unshift('Some measures have unresolved rhythms. Check durations and voice assignments carefully.');
      if (!images.length) warnings.push('A source preview was unavailable. Open the source folder to compare the original.');
      const elapsedMs = Date.now() - started;
      await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ ...manifest, executable, status: 'recognized', elapsedMs, warnings }, null, 2));
      return { jobId, sourceName: input.name, sourceFolder: folder, musicXml, pages: input.pages, images: images.sort((a, b) => a.page - b.page), warnings, elapsedMs };
    } catch (error) {
      processFailure = controller.signal.aborted ? 'Scan cancelled.' : error instanceof Error ? error.message : 'Scanning failed.';
      if (folderCreated) await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ ...manifest, status: 'failed', error: processFailure }, null, 2));
      throw new Error(processFailure);
    } finally {
      try { if (folderCreated) await writeFile(path.join(folder, 'recognition.log'), `${output}\n${processFailure}`); }
      finally { this.active = null; }
    }
  }
}
