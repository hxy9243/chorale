// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AIConnectionStore } from '../../../electron/ai/connectionStore';
import { ScoreAnalysisCoordinator, type AnalysisCompletion } from '../../../electron/ai/scoreAnalysis';
import { createScoreSnapshot } from '../../music/scoreSnapshot';
import { keepAnalysisFinding, musicalAnalysisKey, parseAnalysisResponse } from '../../analysis/scoreAnalysis';
import { validateAnnotation } from '../../music/documentSchema';
import type { MusicContextSnapshot } from '../types';

const directories: string[] = [];
const servers: Server[] = [];
const cipher = { isAvailable: async () => true, encrypt: async (value: string) => Buffer.from(value).toString('base64'),
  decrypt: async (value: string) => ({ value: Buffer.from(value, 'base64').toString(), shouldReEncrypt: false }) };
const abc = 'X:1\nT:Study\nM:4/4\nL:1/4\nK:C\nC4 | D4 | E4 | F4 |]';
const context = (source = abc, revision = 1): MusicContextSnapshot => ({ id: `ctx-${revision}`, documentId: 'score-1', revision,
  abc: source, fileName: 'Study', annotations: [], capturedAt: new Date().toISOString() });
const empty = { findings: [], diagnostics: [], summary: 'C major context; no supported findings in this fixture.' };
const response: AnalysisCompletion = async () => ({ text: JSON.stringify(empty), tokens: 100 });
const chord = { lens: 'chords', annotation: { kind: 'chord', span: { startMeasure: 1, endMeasure: 1 },
  label: 'C major', body: 'The opening C supports this proposed C-major reading.', chordSymbol: 'C', romanNumeral: 'I',
  position: { measure: 1, offset: { numerator: 0, denominator: 1 } } },
  evidence: [{ measure: 1, offset: { numerator: 0, denominator: 1 }, voiceId: 'voice-1' }] };
const setup = async (complete: AnalysisCompletion = response) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chorale-analysis-')); directories.push(directory);
  const store = new AIConnectionStore(directory, cipher); await store.initialize();
  const connection = await store.saveConnection({ name: 'Study provider', kind: 'custom', baseUrl: 'http://localhost:1234/v1', apiKey: 'private-analysis-test-secret' });
  await store.updateModels(connection.id, [{ id: 'analysis', name: 'Analysis model', source: 'live' }, { id: 'chat', name: 'Chat model', source: 'live' }]);
  await store.setSelection({ connectionId: connection.id, modelId: 'chat' });
  await store.setAnalysisSelection({ connectionId: connection.id, modelId: 'analysis' });
  const coordinator = new ScoreAnalysisCoordinator(store, complete);
  await coordinator.preferences('score-1', { lenses: ['chords'], autoRefresh: true });
  return { store, coordinator, connection, directory };
};
const settled = async (coordinator: ScoreAnalysisCoordinator) => {
  await vi.waitFor(async () => expect((await coordinator.get('score-1')).status).not.toBe('running'));
  return coordinator.get('score-1');
};
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('automatic score analysis', () => {
  it('persists a separate validated default without changing the chat model', async () => {
    const { store, connection, directory } = await setup();
    const reloaded = new AIConnectionStore(directory, cipher); await reloaded.initialize();
    expect(reloaded.getAnalysisSelection()).toEqual({ connectionId: connection.id, modelId: 'analysis' });
    expect(reloaded.getSelection()?.modelId).toBe('chat');
    await expect(store.setAnalysisSelection({ connectionId: connection.id, modelId: 'missing' })).rejects.toThrow('unavailable');
    await store.deleteConnection(connection.id); expect(store.getAnalysisSelection()).toBeNull();
  });
  it('validates exact note evidence and rejects invented onsets and unrequested layers', () => {
    const snapshot = createScoreSnapshot({ ...context(), snapshotId: 's' });
    expect(parseAnalysisResponse(JSON.stringify({ ...empty, findings: [chord] }), snapshot, ['chords'], [1,2,3,4], 'r').findings[0].annotation.kind).toBe('chord');
    const invented = { ...chord, evidence: [{ measure: 1, voiceId: 'voice-1', offset: { numerator: 1, denominator: 4 } }] };
    expect(() => parseAnalysisResponse(JSON.stringify({ ...empty, findings: [invented] }), snapshot, ['chords'], [1,2,3,4], 'r')).toThrow('does not exist');
    expect(() => parseAnalysisResponse(JSON.stringify({ ...empty, findings: [chord] }), snapshot, ['modulation'], [1,2,3,4], 'r')).toThrow('evidence');
  });
  it('reuses cached results on display toggles, metadata edits, restart and undo', async () => {
    const complete = vi.fn(response); const { coordinator, store } = await setup(complete);
    await coordinator.request({ context: context() }); expect((await settled(coordinator)).status).toBe('current');
    await coordinator.preferences('score-1', { lenses: [], autoRefresh: true });
    await coordinator.preferences('score-1', { lenses: ['chords'], autoRefresh: true });
    await coordinator.request({ context: context(abc.replace('T:Study', 'T:Renamed'), 2) });
    expect(complete).toHaveBeenCalledTimes(1);
    const restarted = new ScoreAnalysisCoordinator(store, complete);
    expect((await restarted.observe(context(abc, 3))).status).toBe('current');
    await restarted.request({ context: context(abc.replace('C4', 'G4'), 4) }); await settled(restarted);
    expect((await restarted.observe(context(abc, 5))).status).toBe('current'); expect(complete).toHaveBeenCalledTimes(2);
  });
  it('analyzes pickups at their real location and keeps an explicitly anchored pickup note', () => {
    const pickupAbc = 'X:1\nM:4/4\nL:1/4\nK:C\nC | D4 | E4 |]';
    const snapshot = createScoreSnapshot({ ...context(pickupAbc), snapshotId: 'pickup' });
    expect(snapshot.measures[0].measureNumber).toBe(0);
    const pickupChord = { ...chord, annotation: { ...chord.annotation, span: { startMeasure: 0, endMeasure: 0 }, position: { measure: 0, offset: { numerator: 0, denominator: 1 } } },
      evidence: [{ measure: 0, voiceId: 'voice-1', offset: { numerator: 0, denominator: 1 } }] };
    const finding = parseAnalysisResponse(JSON.stringify({ ...empty, findings: [pickupChord] }), snapshot, ['chords'], [0,1,2], 'pickup').findings[0];
    expect(finding.annotation.span.startMeasure).toBe(0);
    const kept = keepAnalysisFinding(finding, 'Study provider', 'Study model');
    expect(validateAnnotation(kept)).toMatchObject({ kind: 'explanation', span: { startMeasure: 1, endMeasure: 1 } });
    expect(kept.body).toContain('Pickup (m. 0)'); expect(kept.body).toContain('Study model');
  });
  it('permits supporting context across a window boundary without moving the finding outside its window', () => {
    const snapshot = createScoreSnapshot({ ...context(), snapshotId: 's' });
    const finding = { ...chord, lens: 'non-chord-tones', annotation: { ...chord.annotation, kind: 'explanation' },
      evidence: [...chord.evidence, { measure: 2, voiceId: 'voice-1', offset: { numerator: 0, denominator: 1 } }] };
    const raw = JSON.stringify({ ...empty, findings: [finding] });
    expect(parseAnalysisResponse(raw, snapshot, ['non-chord-tones'], [1], 'r', { characters: 160000, findings: 256, evidenceMeasures: [1,2] }).findings).toHaveLength(1);
    expect(() => parseAnalysisResponse(raw, snapshot, ['non-chord-tones'], [1], 'r')).toThrow('evidence position');
  });
  it('deduplicates simultaneous requests and ignores cancelled late responses', async () => {
    let release!: (value: Awaited<ReturnType<AnalysisCompletion>>) => void;
    const complete = vi.fn<AnalysisCompletion>(() => new Promise(resolve => { release = resolve; }));
    const { coordinator } = await setup(complete);
    const first = await coordinator.request({ context: context() });
    const second = await coordinator.request({ context: context() }); expect(first.runId).toBe(second.runId);
    await coordinator.observe(context(abc.replace('C4', 'G4'), 2));
    release({ text: JSON.stringify(empty), tokens: 100 });
    await new Promise(resolve => setTimeout(resolve, 5));
    const state = await coordinator.get('score-1'); expect(state.result).toBeUndefined(); expect(state.status).toBe('idle'); expect(complete).toHaveBeenCalledOnce();
  });
  it('runs only missing lenses and keeps automatic findings outside document annotations', async () => {
    const complete = vi.fn<AnalysisCompletion>(async input => ({ text: JSON.stringify({ ...empty, findings: JSON.parse(input.prompt).requestedLenses.includes('chords') ? [chord] : [] }), tokens: 100 }));
    const { coordinator } = await setup(complete); const source = context();
    await coordinator.request({ context: source }); const done = await settled(coordinator);
    expect(done.result?.findings).toHaveLength(1); expect(source.annotations).toEqual([]); expect(source.abc).toBe(abc);
    await coordinator.preferences('score-1', { lenses: ['chords','modulation'], autoRefresh: true });
    await coordinator.request({ context: source }); await settled(coordinator);
    expect(JSON.parse(complete.mock.calls[1][0].prompt).requestedLenses).toEqual(['modulation']);
  });
  it('bounds long-score work, resumes coverage and reconciles tonal context after the windows', async () => {
    const complete = vi.fn(response); const { coordinator } = await setup(complete);
    await coordinator.preferences('score-1', { lenses: ['chords','modulation'], autoRefresh: true });
    const long = context('X:1\nM:4/4\nL:1/4\nK:C\n' + 'C4 | '.repeat(144));
    await coordinator.request({ context: long });
    const partial = await settled(coordinator); expect(partial.status).toBe('partial'); expect(partial.completedMeasures).toBe(128); expect(complete).toHaveBeenCalledTimes(8);
    await coordinator.request({ context: long }); const done = await settled(coordinator);
    expect(done.status).toBe('current'); expect(done.completedMeasures).toBe(144); expect(done.result?.reconciled).toBe(true); expect(complete).toHaveBeenCalledTimes(10);
    expect(JSON.parse(complete.mock.calls[9][0].prompt).task).toContain('whole written score');
  });
  it('redacts provider secrets and pauses on malformed output instead of retrying', async () => {
    const complete = vi.fn<AnalysisCompletion>(async () => { throw new Error('failure private-analysis-test-secret'); });
    const { coordinator } = await setup(complete); await coordinator.request({ context: context() });
    const failed = await settled(coordinator); expect(failed.status).toBe('error'); expect(failed.message).toContain('[redacted]'); expect(failed.message).not.toContain('private-analysis-test-secret'); expect(complete).toHaveBeenCalledOnce();
  });
  it('keeps formatting and annotation-only changes out of musical cache identity', () => {
    expect(musicalAnalysisKey(abc)).toBe(musicalAnalysisKey(abc.replace('T:Study', 'T:Other\nC:Someone')));
    expect(musicalAnalysisKey(abc)).not.toBe(musicalAnalysisKey(abc.replace('K:C', 'K:G')));
  });
  it('uses the real authenticated provider path with the analysis model and no mutation tools', async () => {
    let received: Record<string, unknown> = {}, authorization = '';
    const server = createServer((incoming, response) => {
      authorization = String(incoming.headers.authorization); let body = '';
      incoming.on('data', chunk => { body += chunk; });
      incoming.on('end', () => {
        received = JSON.parse(body); response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const delta = { id: 'analysis', object: 'chat.completion.chunk', created: 1, model: 'analysis', choices: [{ index: 0, delta: { role: 'assistant', content: JSON.stringify({ ...empty, findings: [chord] }) }, finish_reason: null }] };
        response.write(`data: ${JSON.stringify(delta)}\n\n`);
        response.write('data: {"id":"analysis","object":"chat.completion.chunk","created":1,"model":"analysis","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
        response.end('data: [DONE]\n\n');
      });
    });
    servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { store, connection } = await setup();
    await store.saveConnection({ id: connection.id, name: 'Study provider', kind: 'custom', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` });
    const coordinator = new ScoreAnalysisCoordinator(store);
    await coordinator.preferences('score-1', { lenses: ['chords'], autoRefresh: true });
    await coordinator.request({ context: context() }); const done = await settled(coordinator);
    expect(done.status).toBe('current'); expect(done.result?.findings).toHaveLength(1);
    expect(received.model).toBe('analysis'); expect(received.tools).toBeUndefined();
    expect(received.max_tokens ?? received.max_completion_tokens).toBeLessThanOrEqual(8192);
    expect(authorization).toBe('Bearer private-analysis-test-secret'); expect(store.getSelection()?.modelId).toBe('chat');
  });
});
