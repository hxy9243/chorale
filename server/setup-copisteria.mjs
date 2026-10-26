import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// The revision and both model digests are the ones used in our Debussy trial.
const revision = 'bcf4e036fbb1721d525dc78144bc61f3c47db08a';
const repository = 'https://github.com/kobimusic/copisteria.git';
const root = resolve(process.env.CHORALE_COPISTERIA_HOME || join(homedir(), '.chorale/scanners/copisteria'));
const models = [
  { path: 'models/evidence-2m.pt', sha256: '7a3eb0362b44016e941680c5df1e133239576592ab134057c3dbac8e9f3b8838' },
  { path: 'models/small/v7_obj-recall-30m_best.pt', sha256: '9f1db282271fb1064461387da4a2e15de14b099c49b619c21429cdc45be85cfe' },
];
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const exists = (path) => access(path).then(() => true, () => false);
async function digest(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
let pythonCommand = process.env.CHORALE_SCANNER_PYTHON;
if (!pythonCommand) {
  for (const command of ['python3.12', 'python3']) {
    try { run(command, ['-c', 'import sys; assert sys.version_info >= (3,12)'], { stdio: 'ignore' }); pythonCommand = command; break; } catch { /* Try another installed Python. */ }
  }
}
if (!pythonCommand) throw new Error('Install Python 3.12+ (with venv support), or set CHORALE_SCANNER_PYTHON to its executable.');
run(pythonCommand, ['-c', 'import sys; assert sys.version_info >= (3,12), "Copisteria requires Python 3.12+"']);
// Resolve launch shims before venv records its base interpreter location.
pythonCommand = execFileSync(pythonCommand, ['-c', 'import os,sys; print(os.path.realpath(sys.executable))'], { encoding: 'utf8' }).trim();
try { run('pdftoppm', ['-v'], { stdio: 'ignore' }); } catch { throw new Error('Install Poppler (pdftoppm) before setting up PDF recognition.'); }
await mkdir(dirname(root), { recursive: true });
if (!await exists(root)) run('git', ['clone', repository, root]);
// Do not reset a different source tree or overwrite a user's modifications.
const installedRevision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['-C', root, 'diff', 'HEAD', '--'], { encoding: 'utf8' }).trim()) throw new Error(`Copisteria has source modifications in ${root}; use a separate CHORALE_COPISTERIA_HOME.`);
if (installedRevision !== revision) {
  if (execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error(`Copisteria has local changes in ${root}; use a separate CHORALE_COPISTERIA_HOME.`);
  run('git', ['-C', root, 'checkout', '--detach', revision]);
}
let useUv = false;
try { run('uv', ['--version'], { stdio: 'ignore' }); useUv = true; } catch { /* Standard venv/pip remains supported. */ }
if (!await exists(join(root, '.venv'))) {
  if (useUv) run('uv', ['venv', '--python', pythonCommand, join(root, '.venv')]);
  else run(pythonCommand, ['-m', 'venv', join(root, '.venv')]);
}
const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const pip = (args, options = {}) => useUv ? run('uv', ['pip', ...args, '--python', python], options) : run(python, ['-m', 'pip', ...args], options);
// CPU-only wheels avoid installing accelerator runtimes on Linux/Windows.
if (['linux', 'win32'].includes(process.platform)) pip(['install', 'torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cpu']);
pip(['install', '-e', root]);
for (const model of models) {
  const file = join(root, model.path);
  if (!await exists(file)) {
    await mkdir(dirname(file), { recursive: true });
    console.log(`Downloading ${model.path}…`);
    const remotePath = model.path.slice('models/'.length);
    const response = await fetch(`https://huggingface.co/kobimusic/copista-28m/resolve/main/${remotePath}`, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}).`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  }
  if (await digest(file) !== model.sha256) throw new Error(`Model checksum mismatch: ${file}. Remove this file and retry setup.`);
}
run(python, ['-c', 'import torch, torchvision, PIL, cv2, copisteria.pipeline; print("Copisteria dependencies ready")'], { cwd: root });
const dependencies = useUv ? execFileSync('uv', ['pip', 'freeze', '--python', python], { encoding: 'utf8' }) : execFileSync(python, ['-m', 'pip', 'freeze'], { encoding: 'utf8' });
await writeFile(join(root, 'install.json'), JSON.stringify({ name: 'Copisteria', version: '1.3.4', repository, revision, models, license: 'Apache-2.0', pythonVersion: execFileSync(python, ['--version'], { encoding: 'utf8' }).trim(), dependencies, installedAt: new Date().toISOString() }, null, 2));
// Keep upstream notices with the separate installation, not in the application.
await readFile(join(root, 'LICENSE'));
console.log(`Copisteria ready at ${root}. Reopen Chorale and choose Scan PDF / PNG.`);
