// Real Electron -> Pi -> local scripted provider -> sandboxed music21 -> chat.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, cp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright-core';
import { LocalDocumentStore } from '../server/store.mjs';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'chorale-electron-music21-'));
const profile = join(scratch, 'profile'); await mkdir(profile);
const home = join(scratch, 'scores');
const store = new LocalDocumentStore({ baseDir: home, seedDefault: false });
await store.create({ title: 'Electron music21 example', abcSource: 'X:1\nT:Electron music21 example\nM:4/4\nL:1/4\nK:C\n[CEG]4 |]' });
store.close();
const outputDirectory = resolve(process.argv[2] || 'docs/reviews/music21-python-2026-10-23/electron');
await mkdir(outputDirectory, { recursive: true });
const requests = [];
const python = 'chords = list(score.chordify().recurse().getElementsByClass("Chord"))\nresult = {"root": chords[0].root().name, "quality": chords[0].quality, "inversion": chords[0].inversion()}';
const turns = [
  ['select_analysis_profile', { profiles: ['harmony'] }],
  ['read_measure_range', { startMeasure: 1, endMeasure: 1 }],
  ['analyze_music21', { startMeasure: 1, endMeasure: 1, code: python }],
];
const provider = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'local-music21' }] })); return;
  }
  let body = ''; for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body); requests.push(parsed);
  const index = requests.length - 1;
  const delta = index < turns.length
    ? { role: 'assistant', tool_calls: [{ index: 0, id: `review-tool-${index}`, type: 'function', function: { name: turns[index][0], arguments: JSON.stringify(turns[index][1]) } }] }
    : { role: 'assistant', content: 'Verified C major in root position in [m. 1](#measure-1) using the sandboxed music21 tool.' };
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const chunk = (delta, finish_reason) => ({ id: `review-${index}`, object: 'chat.completion.chunk', created: 1, model: 'local-music21', choices: [{ index: 0, delta, finish_reason }] });
  res.write(`data: ${JSON.stringify(chunk(delta, null))}\n\n`);
  res.write(`data: ${JSON.stringify(chunk({}, index < turns.length ? 'tool_calls' : 'stop'))}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(resolveListen => provider.listen(0, '127.0.0.1', resolveListen));
const reservation = createServer();
await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
const port = reservation.address().port;
await new Promise(resolveClose => reservation.close(resolveClose));
const environment = { ...process.env, CHORALE_HOME: home, CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: profile, CHORALE_NODE_EXECUTABLE: process.execPath, CHORALE_SKIP_CLIENT_SETUP: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
let application;
let actualTraces;
try {
  application = await _electron.launch({ executablePath: require('electron'),
    args: [...(process.env.CHORALE_SMOKE_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), join(root, 'dist-electron/main.js')], cwd: root, env: environment, timeout: 30000 });
  const page = await application.firstWindow(); page.setDefaultTimeout(20000);
  actualTraces = await application.evaluate(({ app }) => `${app.getPath('userData')}/chorale-data/agent-traces`);
  await page.locator('.chorale-app-shell').waitFor();
  const baseUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  await page.evaluate(async baseUrl => {
    const bridge = window.choraleAI;
    const connection = await bridge.saveConnection({ name: 'Local scripted music21 review', kind: 'custom', baseUrl, apiKey: 'local-fixture-key' });
    await bridge.refreshModels(connection.id);
    await bridge.setSelection({ connectionId: connection.id, modelId: 'local-music21' });
  }, baseUrl);
  await page.reload();
  await page.getByRole('textbox', { name: 'Ask about the current sheet' }).fill('Use music21 to check the opening chord and inversion.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Verified C major in root position', { exact: false }).first().waitFor({ timeout: 30000 });
  await page.getByText('music21 analysis ready', { exact: true }).first().waitFor();
  assert.equal(requests.length, 4);
  const resultMessage = requests[3].messages.find(message => message.role === 'tool' && message.tool_call_id === 'review-tool-2');
  assert.ok(resultMessage, JSON.stringify(requests[3].messages));
  const evidence = JSON.parse(resultMessage.content);
  assert.deepEqual(evidence.result, { root: 'C', quality: 'major', inversion: 0 });
  assert.equal(evidence.sandbox.syscalls, 'seccomp');
  // Wait for chat-done/trace flush rather than racing the final text delta.
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await readdir(actualTraces)).some(name => name.endsWith('.jsonl'))) break; } catch { /* Trace setup may still be settling. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  await page.screenshot({ path: join(outputDirectory, 'conversation.png') });
  await writeFile(join(outputDirectory, 'provider-requests.json'), JSON.stringify({ provider: 'scripted local HTTP; no live model', requests }, null, 2) + '\n');
  await writeFile(join(outputDirectory, 'result.json'), JSON.stringify({ passed: true, path: 'Electron renderer -> IPC -> AIController -> Pi Agent -> scripted local HTTP provider -> bundled analyze_music21 tool -> Bubblewrap/seccomp Python -> tool result -> chat', providerSimulated: true, evidence }, null, 2) + '\n');
  console.log(`Real Electron music21 conversation passed (${evidence.engine.version}, ${evidence.durationMs} ms). Provider responses were scripted; analysis was real.`);
} finally {
  if (application) {
    // Playwright can leave close() pending after Electron itself has exited
    // when a real provider stream was used. Bound cleanup to the owned child.
    let timer;
    await Promise.race([
      application.close().catch(() => {}),
      new Promise(resolveClose => { timer = setTimeout(resolveClose, 5000); }),
    ]);
    clearTimeout(timer);
    if (application.process().exitCode === null) application.process().kill('SIGTERM');
  }
  if (actualTraces) {
    try {
      const names = (await readdir(actualTraces)).filter(name => name.endsWith('.jsonl'));
      for (const name of names) await cp(join(actualTraces, name), join(outputDirectory, name));
      console.log(`Copied ${names.length} desktop agent trace(s).`);
    } catch (error) { console.error('Desktop trace copy failed:', error.message); }
  }
  try { const runtime = JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')); if (runtime.port === port) process.kill(runtime.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  provider.closeAllConnections(); await new Promise(resolveClose => provider.close(resolveClose));
  await rm(scratch, { recursive: true, force: true });
}
