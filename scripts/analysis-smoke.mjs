import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { _electron } from 'playwright-core';
import { LocalDocumentStore } from '../server/store.mjs';

const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'chorale-analysis-smoke-'));
const home = join(scratch, 'scores'), profile = join(scratch, 'profile'); await mkdir(profile);
const abc = 'X:1\nT:Analysis smoke\nM:4/4\nL:1/4\nV:1 name="Piano"\nK:C\n[V:1] C D E F | G A B c |]';
const store = new LocalDocumentStore({ baseDir: home, seedDefault: false }); await store.create({ abcSource: abc, title: 'Analysis smoke' }); store.close();
const port = await new Promise(resolvePort => { const server = createNetServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolvePort(port)); }); });
let requests = 0, receivedModel;
const provider = createServer((incoming, response) => {
  if (incoming.url?.endsWith('/models')) { response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({ data: [{ id: 'analysis-fixture', name: 'Analysis fixture' }, { id: 'chat-fixture', name: 'Chat fixture' }] })); return; }
  let body = ''; incoming.on('data', chunk => { body += chunk; }); incoming.on('end', () => {
    const payload = JSON.parse(body); requests++; receivedModel = payload.model;
    const prompt = JSON.parse(payload.messages.findLast(m => m.role === 'user').content);
    const measure = prompt.measures.find(m => prompt.targetMeasures.includes(m.measureNumber));
    const event = measure.events.find(e => e.type === 'note');
    const findings = prompt.requestedLenses.map(lens => ({ lens, annotation: {
      kind: lens === 'chords' ? 'chord' : lens === 'modulation' ? 'modulation' : lens === 'voice-leading' ? 'voice-leading' : 'explanation',
      span: { startMeasure: measure.measureNumber, endMeasure: measure.measureNumber }, label: lens === 'chords' ? 'Fixture chord' : `Fixture ${lens}`,
      body: 'Synthetic provider fixture used to verify the application flow. This is not a musical accuracy evaluation.',
      ...(lens === 'chords' ? { chordSymbol: 'C', romanNumeral: 'I', position: event.position } : {}),
    }, evidence: [{ ...event.position, voiceId: event.voiceId }] }));
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = { id: 'analysis-smoke', object: 'chat.completion.chunk', created: 1, model: payload.model,
        choices: [{ index: 0, delta: { role: 'assistant', content: JSON.stringify({ findings, diagnostics: [], summary: 'Synthetic fixture continuity.' }) }, finish_reason: null }] };
      response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      response.write('data: {"id":"analysis-smoke","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'); response.end('data: [DONE]\n\n');
    }, 450);
  });
});
await new Promise(resolveListen => provider.listen(0,'127.0.0.1',resolveListen));
const env = { ...process.env, CHORALE_HOME: home, CHORALE_PORT: String(port), CHORALE_DESKTOP_USER_DATA: profile, CHORALE_NODE_EXECUTABLE: process.execPath, CHORALE_SKIP_CLIENT_SETUP: '1' }; delete env.ELECTRON_RUN_AS_NODE;
let application, page;
try {
  application = await _electron.launch({ executablePath: require('electron'), args: [...(process.env.CHORALE_SMOKE_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), join(root,'dist-electron/main.js')], cwd: root, env, timeout: 30000 });
  console.log('Analysis desktop connected');
  page = await application.firstWindow(); page.setDefaultTimeout(15000); await page.waitForURL('app://chorale/**');
  const errors = []; page.on('pageerror',error => errors.push(error.message)); await page.locator('#paper svg').first().waitFor();
  console.log('Analysis score rendered');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: 'Tools', exact: true }).count(),0);
  await page.getByRole('button', { name: 'Set up', exact: true }).click();
  console.log('Provider settings opened', await page.evaluate(() => ({ bridge: Boolean(window.choraleAI), tabs: [...document.querySelectorAll('[role="tab"]')].map(e=>e.textContent?.trim()) })));
  await page.locator('.ai-add-connection > label select').selectOption('custom');
  await page.getByLabel('Connection name').fill('Local analysis fixture');
  await page.getByLabel('OpenAI-compatible base URL').fill(`http://127.0.0.1:${provider.address().port}/v1`);
  await page.getByLabel('API key', { exact: true }).fill('analysis-smoke-key');
  await page.getByRole('button', { name: 'Save & test', exact: true }).click();
  await page.getByRole('combobox',{name:'Analysis provider',exact:true}).selectOption({ label: 'Local analysis fixture' });
  await page.getByRole('combobox',{name:'Analysis model',exact:true}).selectOption('analysis-fixture');
  await page.getByRole('button', { name: 'Save analysis default' }).click();
  await page.getByText('Default saved. Used for the next analysis.', { exact: true }).waitFor();
  console.log('Default analysis model configured');
  if (process.env.CHORALE_ANALYSIS_SCREENSHOTS) { await page.locator('.default-analysis-model').scrollIntoViewIfNeeded(); await mkdir(process.env.CHORALE_ANALYSIS_SCREENSHOTS,{ recursive:true }); await page.screenshot({ path:join(process.env.CHORALE_ANALYSIS_SCREENSHOTS,'settings.png') }); }
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('switch', { name:'Chords',exact:true }).check();
  await page.locator('.analysis-status').filter({ hasText:'Up to date' }).waitFor();
  assert.equal(receivedModel,'analysis-fixture'); assert.equal(requests,1);
  console.log('Provider analysis rendered');
  await page.locator('[data-analysis-automatic="true"]').first().waitFor();
  await page.locator('[data-analysis-automatic="true"]').first().click();
  await page.getByRole('button',{ name:'Keep as annotation' }).click();
  assert.equal(await page.getByRole('region',{name:'Automatic analysis detail'}).count(),0);
  await page.getByRole('switch',{ name:'Modulation',exact:true }).check();
  await page.locator('.analysis-status').filter({ hasText:'Up to date' }).waitFor();
  await page.getByText('Fixture modulation',{exact:true}).first().waitFor();
  const beforeDisplay = requests;
  await page.getByText('Display options',{exact:true}).click();
  await page.getByRole('combobox',{name:'Chord labels',exact:true}).selectOption('roman');
  await page.getByRole('switch',{name:'Function colors',exact:true}).check();
  assert.equal(requests,beforeDisplay,'Display options reuse analysis without a provider request');
  if (process.env.CHORALE_ANALYSIS_SCREENSHOTS) await page.screenshot({ path:join(process.env.CHORALE_ANALYSIS_SCREENSHOTS,'analysis.png') });
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('dialog',{name:'History',exact:true}).waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'ABC code',exact:true}).click();
  await page.getByRole('tab',{name:'Raw Source',exact:true}).click();
  const before = requests; await page.locator('.abc-textarea').fill(abc.replace('C D E F','D E F G'));
  await page.waitForFunction(() => document.querySelector('.analysis-status')?.textContent?.includes('Up to date'));
  await page.waitForFunction(() => document.querySelector('.rail-tool-button') === null);
  assert.ok(requests > before,'Musical editing refreshes analysis');
  assert.equal(await page.locator('.chord[data-analysis-automatic="true"]').count(),1);
  assert.ok(await page.locator('[data-annotation-id]').count() >= 2,'Kept annotation survives refresh');
  await page.getByRole('switch',{name:'Update analysis after edits'}).uncheck();
  const manualCount = requests; await page.locator('.abc-textarea').fill(abc.replace('C D E F','E F G A'));
  await page.locator('.analysis-status').filter({hasText:'Refresh to update'}).waitFor();
  await new Promise(resolveWait => setTimeout(resolveWait,1800)); assert.equal(requests,manualCount,'Automatic requests stop when refresh is off');
  await page.getByRole('button',{name:'Refresh analysis',exact:true}).click(); await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.locator('.analysis-status').filter({hasText:'Stopped'}).waitFor();
  await page.reload(); await page.locator('.analysis-panel[aria-busy="false"]').waitFor();
  assert.equal(await page.getByRole('switch',{name:'Chords',exact:true}).isChecked(),true,'Lens opt-in survives reload');
  assert.equal(await page.getByRole('switch',{name:'Update analysis after edits'}).isChecked(),false,'Refresh preference survives reload');
  const pickupAbc = abc.replace('C D E F | G A B c |]', 'C | G A B c | d c B A |]');
  await page.getByRole('tab',{name:'Raw Source',exact:true}).click();
  await page.locator('.abc-textarea').fill(pickupAbc);
  await page.locator('.analysis-status').filter({hasText:'Refresh to update'}).waitFor();
  await page.getByRole('button',{name:'Refresh analysis',exact:true}).click();
  await page.locator('.analysis-status').filter({hasText:'Up to date'}).waitFor();
  await page.locator('.chord[data-analysis-automatic="true"]').first().click();
  await page.getByRole('button',{name:'Keep pickup note at m. 1',exact:true}).click();
  await page.getByText('Pickup · Fixture chord',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Analysis Electron smoke passed: real provider connection/model setup, authenticated model requests, overlays, display controls, keep annotation, History navigation, edit refresh, pause, stop, reload and pickup notes. Responses were synthetic fixtures.');
} catch (error) {
  if (page && process.env.CHORALE_ANALYSIS_SCREENSHOTS) { await mkdir(process.env.CHORALE_ANALYSIS_SCREENSHOTS,{recursive:true}); await page.screenshot({path:join(process.env.CHORALE_ANALYSIS_SCREENSHOTS,'failure.png')}).catch(()=>{}); }
  console.error('Analysis desktop smoke failed:',error); throw error;
}
finally {
  if (application) { const kill=setTimeout(()=>application.process().kill('SIGKILL'),5000); try { await Promise.race([application.close(),new Promise(resolveWait=>setTimeout(resolveWait,5500))]); } finally { clearTimeout(kill); } }
  try { const runtime=JSON.parse(await readFile(join(home,'runtime.json'),'utf8')); process.kill(runtime.pid,'SIGTERM'); } catch { /* No daemon remains. */ }
  provider.closeAllConnections(); await new Promise(resolveClose=>provider.close(resolveClose)); await rm(scratch,{recursive:true,force:true});
}
