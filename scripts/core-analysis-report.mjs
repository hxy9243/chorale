// Recompute the pilot's selected-claim scores and usage from preserved artifacts.
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve(process.argv[2] || 'docs/reviews/deterministic-analysis-core-2026-10-25');
const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const protocol = await read('protocol.json');
const inputsText = await readFile(resolve(directory, 'inputs.json'), 'utf8');
assert.equal(hash(inputsText), protocol.inputSha256);
const inputs = JSON.parse(inputsText);
const ledger = await read('claim-ledger.json');
let timeline;
try { timeline = await read('timeline.json'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // Preserve original artifact write times so a later git checkout can rerun the audit.
  timeline = { source: 'Original file-write timestamps captured after the run; not server execution timestamps.', files: {} };
  for (const c of inputs) {
    for (const name of [`${c.id}-before-response.json`, `${c.id}-evidence.json`]) {
      timeline.files[name] = { writtenAtMs: (await stat(resolve(directory, name))).mtimeMs,
        sha256: hash(await readFile(resolve(directory, name))) };
    }
  }
  await writeFile(resolve(directory, 'timeline.json'), JSON.stringify(timeline, null, 2) + '\n');
}
const rows = [];
let lastBefore = 0;
let firstEvidence = Infinity;
for (const c of inputs) {
  const before = await read(`${c.id}-before-response.json`);
  const after = await read(`${c.id}-after-response.json`);
  const beforeRequest = await read(`${c.id}-before-request.json`);
  const afterRequest = await read(`${c.id}-after-request.json`);
  const evidence = await read(`${c.id}-evidence.json`);
  for (const [request, response] of [[beforeRequest, before], [afterRequest, after]]) {
    assert.equal(request.model, protocol.model);
    assert.equal(response.model, protocol.model);
    assert.equal(response.provider, protocol.provider);
    assert.deepEqual(request.settings, protocol.settings);
    assert.equal(request.systemPrompt, protocol.system);
    assert.equal(response.requestSha256, hash(JSON.stringify(request)));
    assert.equal(response.stopReason, 'stop');
    assert.ok(response.text);
    assert.ok(request.messages[0].content.includes(c.abc));
  }
  assert.deepEqual(beforeRequest.messages[0], afterRequest.messages[0]);
  assert.equal(beforeRequest.messages.length, 1);
  assert.equal(afterRequest.messages.length, 2);
  assert.ok(afterRequest.messages[1].content.endsWith(JSON.stringify(evidence.suppliedEvidence)));
  for (const name of [`${c.id}-before-response.json`, `${c.id}-evidence.json`]) {
    assert.equal(hash(await readFile(resolve(directory, name))), timeline.files[name].sha256);
  }
  lastBefore = Math.max(lastBefore, timeline.files[`${c.id}-before-response.json`].writtenAtMs);
  firstEvidence = Math.min(firstEvidence, timeline.files[`${c.id}-evidence.json`].writtenAtMs);
  const prompt = value => value.usage.input + value.usage.cacheRead + value.usage.cacheWrite;
  rows.push({ id: c.id, beforePromptTokens: prompt(before), afterPromptTokens: prompt(after),
    addedPromptTokens: prompt(after) - prompt(before), beforeOutputTokens: before.usage.output,
    afterOutputTokens: after.usage.output, beforeLatencyMs: before.latencyMs, afterLatencyMs: after.latencyMs,
    beforeCatalogCostEstimate: before.usage.cost.total, afterCatalogCostEstimate: after.usage.cost.total });
}
assert.ok(lastBefore < firstEvidence, 'All baselines must finish before the first evidence artifact');
const sum = key => rows.reduce((total, row) => total + row[key], 0);
const metrics = {
  protocolChecks: { matchedBasePrompts: true, matchedModelsAndSettings: true, allBaselinesPersistedBeforeFirstEvidence: true },
  targetCount: ledger.targets.length,
  targetLocatedPatternBefore: ledger.targets.filter(t => t.before.locatedPattern).length,
  targetLocatedPatternAfter: ledger.targets.filter(t => t.after.locatedPattern).length,
  targetExactBefore: ledger.targets.filter(t => t.before.locatedPattern && t.before.exactPitches).length,
  targetExactAfter: ledger.targets.filter(t => t.after.locatedPattern && t.after.exactPitches).length,
  cleanControlsWithInventedCoreWarningsBefore: ledger.controls.filter(c => c.before.inventedCoreWarning).length,
  cleanControlsWithInventedCoreWarningsAfter: ledger.controls.filter(c => c.after.inventedCoreWarning).length,
  cleanControlCount: ledger.controls.length, rows,
  totals: Object.fromEntries(Object.keys(rows[0]).filter(key => key !== 'id').map(key => [key, sum(key)])),
  billedCost: null, costNote: 'SDK catalog estimates, not invoices or actual OAuth charges.',
  sampling: 'Provider default, one observation per arm; internal SDK retries were not individually instrumented.',
};
await writeFile(resolve(directory, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
console.log(`Audited ${inputs.length} pairs; exact selected claims ${metrics.targetExactBefore}/${metrics.targetCount} -> ${metrics.targetExactAfter}/${metrics.targetCount}; added prompt tokens ${metrics.totals.addedPromptTokens}.`);
