import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';

const version = '5.11.0';
const url = `https://github.com/Audiveris/audiveris/releases/download/${version}/Audiveris-${version}-ubuntu24.04-x86_64.deb`;
const sha256 = 'f20113aaa33b3149ec8d6a09b2a7963360e65fafd92d69389987a85bbc3ec7a3';
const root = resolve(import.meta.dirname, '../.local/audiveris');
const executable = join(root, 'runtime/opt/audiveris/bin/Audiveris');
// Audiveris uses Tesseract's legacy engine, which tessdata_fast cannot run.
const ocrUrl = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata/4.1.0/eng.traineddata';
const ocrSha256 = 'daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047';

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('This helper supports Linux x64 (Ubuntu 24.04+). Install the official Audiveris release for your OS and set CHORALE_AUDIVERIS to its executable. See docs/score-scan-import.md.');
}
await mkdir(root, { recursive: true });
const archive = join(root, 'package.deb');
try { await access(archive); } catch {
  console.log(`Downloading official Audiveris ${version} into this worktree (about 78 MB).`);
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
}
const hash = createHash('sha256');
for await (const bytes of createReadStream(archive)) hash.update(bytes);
if (hash.digest('hex') !== sha256) throw new Error('Audiveris checksum mismatch. Remove .local/audiveris/package.deb and retry.');
execFileSync('dpkg-deb', ['-x', archive, join(root, 'runtime')], { stdio: 'inherit' });
const ocrFolder = join(root, 'tessdata');
await mkdir(ocrFolder, { recursive: true });
const ocrPath = join(ocrFolder, 'eng.traineddata');
try { await access(ocrPath); } catch {
  console.log('Downloading English text-recognition data (about 23 MB).');
  const response = await fetch(ocrUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error('English text-recognition data could not be downloaded.');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(ocrPath));
}
if (createHash('sha256').update(await readFile(ocrPath)).digest('hex') !== ocrSha256) {
  throw new Error('Text-recognition data checksum mismatch. Remove .local/audiveris/tessdata/eng.traineddata and retry.');
}
const engineVersion = execFileSync(executable, ['-version'], { encoding: 'utf8' });
await writeFile(join(root, 'install.json'), JSON.stringify({ version, url, sha256, ocr: { url: ocrUrl, sha256: ocrSha256, license:'Apache-2.0' }, installedAt: new Date().toISOString(), engineVersion }, null, 2));
await writeFile(join(root, 'LICENSE'), await readFile(join(root, 'runtime/opt/audiveris/share/doc/copyright')));
console.log(engineVersion.trim());
console.log('Local scanner ready. Start this worktree with npm run dev:electron.');
