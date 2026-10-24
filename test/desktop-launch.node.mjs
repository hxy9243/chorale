import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { launchDesktop } from '../server/desktop.mjs';

const exec = promisify(execFile);
const launcherUrl = new URL('../server/desktop.mjs', import.meta.url).href;
async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), 'Chorale detached launch '));
  await mkdir(join(root, 'dist-electron'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'dist-electron/preload.cjs'), '');
  const pidPath = join(root, 'desktop.pid');
  await writeFile(join(root, 'dist-electron/main.js'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));\n${source}`);
  t.after(async () => {
    try { process.kill(Number(await readFile(pidPath, 'utf8')), 'SIGTERM'); } catch { /* Already stopped or never spawned. */ }
    await rm(root, { recursive: true, force: true });
  });
  return { packageRoot: root, electronPath: process.execPath, choraleHome: join(root, 'data') };
}

test('default launch releases the CLI while its detached app stays alive and continues logging', { timeout: 10_000 }, async t => {
  const options = await fixture(t, `
    console.error('desktop boot');
    process.send({ type: 'chorale:desktop-ready' });
    setInterval(() => console.error('desktop still alive'), 40);
  `);
  const { stdout, stderr } = await exec(process.execPath, ['--input-type=module', '-e', `
    import { launchDesktop } from ${JSON.stringify(launcherUrl)};
    const result = await launchDesktop(${JSON.stringify(options)});
    console.log(JSON.stringify(result));
  `], { timeout: 4000 });
  const result = JSON.parse(stdout);
  assert.equal(result.statusCode, 0);
  assert.equal(result.detached, true);
  assert.equal(stderr, '');
  assert.doesNotThrow(() => process.kill(result.pid, 0));
  if (process.platform === 'linux') {
    const processStat = await readFile(`/proc/${result.pid}/stat`, 'utf8');
    const fields = processStat.slice(processStat.lastIndexOf(')') + 2).trim().split(/\s+/);
    assert.equal(Number(fields[3]), result.pid, 'Detached app owns its session independently of the terminal');
  }
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.match(await readFile(result.logPath, 'utf8'), /desktop still alive/);
  if (process.platform !== 'win32') assert.equal((await stat(result.logPath)).mode & 0o777, 0o600);
});

test('debug launch streams logs and waits for the app exit status', async t => {
  const options = await fixture(t, `console.error('debug detail'); setTimeout(() => process.exit(7), 150);`);
  let output = '';
  let finished = false;
  const running = launchDesktop({ ...options, debug: true, logger: { error() {} }, stderr: { write(chunk) { output += chunk; } } })
    .then(result => { finished = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(finished, false);
  assert.deepEqual(await running, { statusCode: 7 });
  assert.match(output, /debug detail/);
});

test('detached startup reports sandbox failures and ignores stale logs', async t => {
  const options = await fixture(t, `console.error('The SUID sandbox helper binary was found, but is not configured correctly.'); process.exit(1);`);
  await mkdir(options.choraleHome);
  await writeFile(join(options.choraleHome, 'desktop.log'), 'stale message\n');
  const errors = [];
  const result = await launchDesktop({ ...options, logger: { error: message => errors.push(message) } });
  assert.equal(result.statusCode, 1);
  assert.match(errors[0], /sudo chmod 4755/);
  assert.doesNotMatch(errors[0], /stale message/);
});

test('a second instance can exit successfully after focusing the existing app', async t => {
  const options = await fixture(t, 'process.exit(0);');
  assert.deepEqual(await launchDesktop(options), { statusCode: 0 });
});

test('startup timeout terminates an app that never signals readiness', async t => {
  const options = await fixture(t, 'setInterval(() => {}, 1000);');
  await assert.rejects(launchDesktop({ ...options, startupTimeoutMs: 100 }), /did not become ready.*chorale --debug/);
});

test('spawn failure rejects without leaving the CLI attached', async t => {
  const options = await fixture(t, '');
  await assert.rejects(launchDesktop({ ...options, electronPath: join(options.packageRoot, 'missing-electron') }), /ENOENT/);
});
