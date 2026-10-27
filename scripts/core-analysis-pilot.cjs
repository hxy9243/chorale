// Run with the repository's Electron executable. Credentials stay in main.
const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'docs/reviews/deterministic-analysis-core-2026-10-25'));
app.setName('Chorale');
app.setPath('userData', path.join(os.tmpdir(), `chorale-core-pilot-${process.pid}`));
const system = 'You are a careful music tutor helping a student inspect a short score. Analyze only the supplied notation and any supplied computed evidence. Locate concrete claims with voices, exact pitches, and original measure/beat positions. Separate geometric interval/motion facts from style-dependent advice. Do not invent missing data or label intentional keyboard texture as SATB errors. If evidence has incomplete coverage, say exactly what cannot be concluded. Respond in at most 400 words.';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const read = async name => JSON.parse(await fs.readFile(path.join(output, name), 'utf8'));
let stage = 'input';

async function main() {
  // Public inputs never include the separately stored authored reference answers.
  const inputsText = await fs.readFile(path.join(output, 'inputs.json'), 'utf8');
  const inputs = JSON.parse(inputsText);
  const cache = path.join(root, 'node_modules/.cache'); await fs.mkdir(cache, { recursive: true });
  const scratch = await fs.mkdtemp(path.join(cache, 'chorale-core-pilot-'));
  try {
    const bundle = path.join(scratch, 'adapters.mjs');
    await require('esbuild').build({
      stdin: { contents: [
        "export { AIConnectionStore } from './electron/ai/connectionStore.ts';",
        "export { ElectronSecretCipher } from './electron/ai/electronCipher.ts';",
        "export { createProviderRuntime } from './electron/ai/providers.ts';",
      ].join('\n'), resolveDir: root },
      outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
    });
    stage = 'load-desktop-adapters';
    const { AIConnectionStore, ElectronSecretCipher, createProviderRuntime } = await import(pathToFileURL(bundle));
    stage = 'load-saved-connection';
    const store = new AIConnectionStore(path.join(app.getPath('appData'), 'Chorale/chorale-data'), new ElectronSecretCipher());
    await store.initialize();
    const selection = store.getSelection();
    if (!selection) { const error = new Error(); error.code = 'NO_SELECTED_CONNECTION'; throw error; }
    const connection = store.getConnection(selection.connectionId);
    const option = store.getModels(selection.connectionId).find(m => m.id === selection.modelId);
    if (!connection || !option) { const error = new Error(); error.code = 'NO_SELECTED_MODEL'; throw error; }
    stage = 'provider-runtime';
    const { models, model } = createProviderRuntime(connection, option, store);
    const sensitive = [];
    const collect = value => {
      if (typeof value === 'string' && value.length >= 4) sensitive.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(store.getSecret(selection.connectionId));
    const redact = value => sensitive.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value || ''));
    const settings = { reasoning: 'low', maxTokens: 6000, ...(connection.kind === 'openai-codex' ? {} : { temperature: 0 }) };
    const protocol = { version: 1, inputSha256: hash(inputsText), system, model: model.id,
      provider: model.provider, settings, author: 'GPT-6 Astra High subagent',
      arms: 'Same model/base prompt; after adds actual helper evidence. All baselines finish before evidence is computed.',
      scope: 'Supplied-evidence pilot, not autonomous tool-selection or desktop end-to-end quality.',
      references: 'AI-authored provisional labels excluded from both prompts; require independent musical review.',
      sampling: connection.kind === 'openai-codex' ? 'Provider default; Codex rejects explicit temperature. Same settings in both arms.' : 'temperature=0',
      cost: 'SDK catalog estimates are not billed costs; OAuth account usage does not provide an invoice here.' };
    try {
      const previous = await read('protocol.json');
      if (JSON.stringify(previous) !== JSON.stringify(protocol)) throw new Error('Protocol differs from existing run; choose a fresh output directory');
    } catch (error) { if (error.code !== 'ENOENT') throw error; await write('protocol.json', protocol); }
    async function generate(c, arm, evidence) {
      const user = `Texture: ${c.style}. Declared high-to-low voice order: ${c.voiceOrder.join(', ')}.\n${c.question}\n\n${c.abc}`;
      const messages = [{ role: 'user', content: user, timestamp: 0 }];
      if (evidence) messages.push({ role: 'user', timestamp: 0, content: 'Additional read-only evidence computed for this exact score. Positions use zero-based rational quarter-length offsets; read coverage and diagnostics. Pattern observations require musical interpretation.\n' + JSON.stringify(evidence) });
      const request = { model: model.id, provider: model.provider, systemPrompt: system, messages, settings };
      const responseName = `${c.id}-${arm}-response.json`;
      try {
        const existing = await read(responseName);
        if (existing.requestSha256 !== hash(JSON.stringify(request))) throw new Error('Saved request mismatch');
        if (existing.stopReason === 'stop' && existing.text) return;
        await write(`${c.id}-${arm}-failed-${Date.now()}.json`, existing);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await write(`${c.id}-${arm}-request.json`, request);
      const started = Date.now();
      const response = await models.completeSimple(model, { systemPrompt: system, messages }, {
        ...settings, signal: AbortSignal.timeout(180000),
      });
      const text = response.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
      const record = { requestSha256: hash(JSON.stringify(request)), latencyMs: Date.now() - started,
        model: response.model, provider: response.provider, api: response.api, stopReason: response.stopReason,
        usage: response.usage, text,
        ...(response.errorMessage ? { error: redact(response.errorMessage).slice(0, 2000) } : {}) };
      // Preserve visible model output and usage; never serialize credentials or opaque reasoning payloads.
      await write(responseName, record);
      await fs.writeFile(path.join(output, `${c.id}-${arm}.md`), text + '\n');
      if (response.stopReason !== 'stop' || !text) throw new Error(`Incomplete model output for ${c.id}/${arm}; see saved stop reason`);
      console.log(JSON.stringify({ case: c.id, arm, model: response.model, latencyMs: record.latencyMs, tokens: response.usage?.totalTokens }));
    }
    stage = 'baseline-model-calls';
    for (const c of inputs) await generate(c, 'before');
    stage = 'compute-evidence-and-compare';
    const { analyzeMusic21Python } = await import(pathToFileURL(path.join(root, 'server/music21-python.mjs')));
    for (const c of inputs) {
      const code = `result=analyze(voice_order=${JSON.stringify(c.voiceOrder)}, profile=${JSON.stringify(c.style === 'satb' ? 'chorale' : 'free')})`;
      const result = await analyzeMusic21Python({ abcSource: c.abc, documentId: c.id, revision: 1, startMeasure: 1, endMeasure: 4, code });
      const evidence = { engine: result.engine, range: result.range, ...result.result };
      await write(`${c.id}-evidence.json`, { arguments: { startMeasure: 1, endMeasure: 4, code }, response: result, suppliedEvidence: evidence });
      await generate(c, 'after', evidence);
    }
    const manifest = [];
    for (const name of (await fs.readdir(output)).sort()) {
      if (name === 'run-manifest.json') continue;
      if (name.endsWith('.json') || name.endsWith('.md')) manifest.push({ name, sha256: hash(await fs.readFile(path.join(output, name))) });
    }
    await write('run-manifest.json', { completedAt: new Date().toISOString(), model: model.id, liveProvider: true, files: manifest });
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
}

app.whenReady().then(main).then(() => app.exit(0)).catch(error => {
  // Errors from authentication/network code can contain sensitive details. Keep terminal diagnostics generic.
  console.error(`Core pilot stopped at ${stage} (${error.code || error.name || 'error'}). Check saved response status and protocol; no credentials logged.`);
  app.exit(1);
});
