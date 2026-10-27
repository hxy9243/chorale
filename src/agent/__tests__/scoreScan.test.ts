// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { parseScanPages, ScoreScanner, validateScanRequest } from '../../../electron/scoreScan';

const directories: string[] = [];
const pdf = new TextEncoder().encode('%PDF-1.4\nfixture').buffer;
const request = { name: 'Score with spaces.pdf', bytes: pdf, pages: '1,3-4', engine: 'audiveris' as const };
const xml = '<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const fixture = async (body?: string, timeoutMs?: number) => {
  const root = await mkdtemp(path.join(tmpdir(), 'chorale-scan-test-'));
  directories.push(root);
  const executable = path.join(root, 'fake-engine');
  const archive = new JSZip();
  archive.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="score/main.musicxml"/></rootfiles></container>');
  archive.file('score/main.musicxml', xml);
  const exported = await archive.generateAsync({ type: 'base64' });
  await writeFile(executable, `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');\nconst args=process.argv.slice(2),folder=args[args.indexOf('-output')+1];\nfs.writeFileSync(path.join(folder,'args.json'),JSON.stringify(args));\n${body || `fs.writeFileSync(path.join(folder,'output.mxl'),Buffer.from('${exported}','base64')); console.log('WARN fixture warning');`}`, { mode: 0o755 });
  return { root, scanner: new ScoreScanner({ projectDirectory: root, root: path.join(root, 'imports'), executable, timeoutMs }) };
};

describe('local score recognition boundary', () => {
  it('bounds page selection, deduplicates pages and refuses arguments disguised as pages', () => {
    expect(parseScanPages('4, 1-3, 2')).toEqual([1, 2, 3, 4]);
    expect(parseScanPages('1-60')).toHaveLength(60);
    for (const invalid of ['0', '1-61', '3-1', '1 --output /tmp', '', '1,']) {
      expect(() => parseScanPages(invalid)).toThrow();
    }
  });

  it('rejects wrong signatures, paths and oversized images before invoking a process', () => {
    expect(() => validateScanRequest({ ...request, name: '../../score.pdf' })).toThrow('name');
    expect(() => validateScanRequest({ ...request, name: 'score.png' })).toThrow('PNG');
    expect(() => validateScanRequest({ ...request, bytes: new ArrayBuffer(21 * 1024 * 1024) })).toThrow('20 MB');
    const image = Buffer.alloc(33);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(image); image.write('IHDR', 12); image.writeUInt32BE(10000,16); image.writeUInt32BE(10000,20);
    const bytes = image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength);
    expect(() => validateScanRequest({ name:'test.png', bytes, pages:'1' })).toThrow('40 megapixels');
  });

  it('reports a missing executable without accepting a scan', async () => {
    const scanner = new ScoreScanner({ projectDirectory: '/missing', executable: '/no-such-audiveris' });
    expect((await scanner.status()).engines.find((engine) => engine.id === 'audiveris')?.available).toBe(false);
    await expect(scanner.scan(request)).rejects.toThrow('Install Audiveris');
  });

  it('preserves source bytes and MusicXML, expands MXL using its container and passes bounded arguments', async () => {
    const { scanner } = await fixture();
    const result = await scanner.scan(request);
    expect(result.musicXml).toBe(xml);
    expect(result.pages).toEqual([1,3,4]);
    expect(await readFile(path.join(result.sourceFolder,'source.pdf'))).toEqual(Buffer.from(pdf));
    expect(await readFile(path.join(result.sourceFolder,'recognized.musicxml'),'utf8')).toBe(xml);
    expect(JSON.parse(await readFile(path.join(result.sourceFolder,'manifest.json'),'utf8')).status).toBe('recognized');
    const args = JSON.parse(await readFile(path.join(result.sourceFolder,'args.json'),'utf8'));
    expect(args.slice(0,8)).toEqual(['-batch','-transcribe','-export','-save','-sheets','1','3','4']);
    expect(args.at(-2)).toBe('--');
    expect(result.warnings).toContain('WARN fixture warning');
  });

  it('rejects no-note output instead of presenting a successful import', async () => {
    const { scanner } = await fixture(`fs.writeFileSync(path.join(folder,'output.musicxml'),'<score-partwise/>');`);
    await expect(scanner.scan(request)).rejects.toThrow('No pitched notes');
  });

  it('rejects partial exports even when Audiveris exits successfully and writes pitched notes', async () => {
    const { scanner } = await fixture(`fs.writeFileSync(path.join(folder,'output.musicxml'),${JSON.stringify(xml)}); console.log('WARN [source] PartwiseBuilder 2229 | Error visiting Measure{#5}'); console.log('java.lang.NullPointerException: timeOffset is null');`);
    await expect(scanner.scan(request)).rejects.toThrow('could not finish exporting');
    const [job] = await readdir(scanner.root);
    const folder=path.join(scanner.root,job);
    expect(await readFile(path.join(folder,'recognized.musicxml'),'utf8')).toBe(xml);
    expect(JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8')).status).toBe('failed');
  });

  it('rejects recognized notes without a time signature instead of converting them to unmetered music', async () => {
    const noMeter=xml.replace('<time><beats>4</beats><beat-type>4</beat-type></time>','');
    const {scanner}=await fixture(`fs.writeFileSync(path.join(folder,'output.musicxml'),${JSON.stringify(noMeter)});`);
    await expect(scanner.scan(request)).rejects.toThrow('could not determine the time signature');
  });

  it('kills a cancelled job, records failure and rejects concurrent scans', async () => {
    const { scanner } = await fixture('setInterval(()=>{},1000);');
    const pending = scanner.scan(request);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await expect(scanner.scan(request)).rejects.toThrow('already running');
    // Wait until the real subprocess has started, rather than cancelling setup.
    const deadline = Date.now()+2000;
    let started = false;
    while(Date.now()<deadline && !started) {
      for(const job of await readdir(scanner.root).catch(()=>[])) {
        started = await readFile(path.join(scanner.root,job,'args.json')).then(()=>true,()=>false);
      }
      if(!started) await new Promise((done)=>setTimeout(done,10));
    }
    expect(started).toBe(true);
    scanner.cancel();
    await rejected;
  });

  it('times out a stalled recognizer and preserves diagnostics', async () => {
    const { scanner } = await fixture('console.log("started"); setInterval(()=>{},1000);', 1000);
    await expect(scanner.scan(request)).rejects.toThrow('limit');
    const [job] = await readdir(scanner.root);
    expect(JSON.parse(await readFile(path.join(scanner.root,job,'manifest.json'),'utf8')).status).toBe('failed');
    expect(await readFile(path.join(scanner.root,job,'recognition.log'),'utf8')).toContain('started');
  });

  it('rejects engine names and defaults omitted engine to Copisteria', () => {
    expect(() => validateScanRequest({ ...request, engine: '/tmp/recognizer' })).toThrow('Choose Copisteria or Audiveris');
    expect(validateScanRequest({ ...request, engine: undefined }).engine).toBe('copisteria');
  });

  it('runs default Copisteria with original page numbers and preserves engine provenance', async () => {
    const { root } = await fixture();
    const home = path.join(root, 'copisteria');
    await mkdir(path.join(home, '.venv/bin'), { recursive: true });
    await mkdir(path.join(home, 'models/small'), { recursive: true });
    await writeFile(path.join(home, 'models/evidence-2m.pt'), 'fixture');
    await writeFile(path.join(home, 'models/small/v7_obj-recall-30m_best.pt'), 'fixture');
    await writeFile(path.join(home, 'install.json'), JSON.stringify({ revision: 'tested-revision', models: ['fixture-hash'] }));
    await writeFile(path.join(home, '.venv/bin/python'), `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),folder=args[args.indexOf('--folder')+1];
fs.writeFileSync(path.join(folder,'args.json'),JSON.stringify(args));
fs.writeFileSync(path.join(folder,'recognized.musicxml'),${JSON.stringify(xml)});
const pages=JSON.parse(args[args.indexOf('--pages')+1]);
fs.mkdirSync(path.join(folder,'pages'));
for(const page of pages)fs.writeFileSync(path.join(folder,'pages','page-'+String(page).padStart(6,'0')+'.png'),Buffer.from([137,80,78,71]));
fs.writeFileSync(path.join(folder,'copisteria.json'),JSON.stringify({pageMeasures:pages.map(page=>({page,firstMeasure:1,lastMeasure:1}))}));
`, { mode: 0o755 });
    const scanner = new ScoreScanner({ projectDirectory: root, copisteriaHome: home, executable: '/missing-audiveris', root: path.join(root, 'imports') });
    const status = await scanner.status();
    expect(status.available).toBe(true);
    expect(status.engines.find((engine) => engine.id === 'audiveris')?.available).toBe(false);
    const result = await scanner.scan({ ...request, engine: undefined });
    expect(result.engine).toBe('copisteria');
    expect(result.images.map((image) => image.page)).toEqual([1, 3, 4]);
    const manifest = JSON.parse(await readFile(path.join(result.sourceFolder, 'manifest.json'), 'utf8'));
    expect(manifest.engine).toBe('copisteria');
    expect(manifest.installation.revision).toBe('tested-revision');
    expect(manifest.pageMeasures.map((entry: { page: number }) => entry.page)).toEqual([1, 3, 4]);
    const args = JSON.parse(await readFile(path.join(result.sourceFolder, 'args.json'), 'utf8'));
    expect(args[0]).toBe(path.join(root, 'server/python/score_scan.py'));
    expect(args[args.indexOf('--pages') + 1]).toBe('[1,3,4]');
  });

  it('does not fall back to Audiveris when default Copisteria is unavailable', async () => {
    const { scanner, root } = await fixture();
    const isolated = new ScoreScanner({ projectDirectory: root, copisteriaHome: '/missing-copisteria', executable: path.join(root, 'fake-engine'), root: scanner.root });
    await expect(isolated.scan({ ...request, engine: undefined })).rejects.toThrow('Copisteria unavailable');
    expect((await isolated.status()).engines.find((engine) => engine.id === 'audiveris')?.available).toBe(true);
  });

  it('refuses source-folder traversal', async () => {
    const { scanner } = await fixture();
    expect(() => scanner.sourceFolder('../secrets')).toThrow('identifier');
  });
});
