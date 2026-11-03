// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AIConnectionStore } from '../../../electron/ai/connectionStore';
import { ScoreAnalysisCoordinator, type AnalysisCompletion } from '../../../electron/ai/scoreAnalysis';
import { createScoreSnapshot } from '../../music/scoreSnapshot';
import { createRationalDuration } from '../../music/rational';
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
const chord = { lens: 'chords', annotation: { kind: 'chord', span: { startMeasure: 1, endMeasure: 1 },
  label: 'C major', body: 'The opening C supports this proposed C-major reading.', chordSymbol: 'C', romanNumeral: 'I',
  position: { measure: 1, offset: { numerator: 0, denominator: 1 } } },
  evidence: [{ measure: 1, offset: { numerator: 0, denominator: 1 }, voiceId: 'voice-1' }] };
// Provider fixture: a label at each measure's first note, with the remaining
// onsets explicitly continuing it. These are protocol fixtures, not gold harmony.
const response: AnalysisCompletion = async input => {
  const prompt = JSON.parse(input.prompt);
  const targets = prompt.measures.filter((m: { measureNumber: number }) => prompt.targetMeasures?.includes(m.measureNumber));
  const findings = prompt.requestedLenses.includes('chords') ? targets.flatMap((m: { measureNumber: number; events: { type: string; position: { offset: { numerator: number; denominator: number } }; voiceId: string }[] }) => {
    const event = m.events.find(e => e.type === 'note');
    return event ? [{ ...chord, annotation: { ...chord.annotation, span: { startMeasure: m.measureNumber, endMeasure: m.measureNumber },
      position: { measure: m.measureNumber, offset: event.position.offset } },
      evidence: [{ measure: m.measureNumber, offset: event.position.offset, voiceId: event.voiceId }] }] : [];
  }) : [];
  const chordContinuations = prompt.requestedLenses.includes('chords') ? prompt.chordReviewOnsets.map((m: { measure: number; offsets: unknown[] }) => ({ ...m, offsets: m.offsets.slice(1) })) : [];
  return { text: JSON.stringify({ ...empty, findings, chordContinuations }), tokens: 100 };
};
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
  it('exposes only current enabled findings as separate read-only chat references', async () => {
    const { coordinator } = await setup();
    await coordinator.request({ context: context() }); await settled(coordinator);
    const references = coordinator.getAnnotationReferences(context());
    expect(references).toHaveLength(4);
    references[0].label = 'Changed caller copy';
    expect(coordinator.getAnnotationReferences(context())[0].label).not.toBe('Changed caller copy');
    expect(coordinator.getAnnotationReferences(context(abc.replace('C4','G4'), 2))).toEqual([]);
    await coordinator.preferences('score-1', { lenses: [], autoRefresh: true });
    expect(coordinator.getAnnotationReferences(context())).toEqual([]);
  });
  it('does not mark a selective chord response as complete, and replaces it on continuation', async () => {
    const source = context('X:1\nM:4/4\nL:1/4\nK:Cm\n[CEG] [ACEF] [=B,DG] [CEG] |]');
    const complete = vi.fn<AnalysisCompletion>(async () => ({ text: JSON.stringify({ ...empty, findings: [chord] }), tokens: 100 }));
    const { coordinator } = await setup(complete);
    await coordinator.request({ context: source });
    const partial = await settled(coordinator);
    expect(partial.status).toBe('partial'); expect(partial.completedMeasures).toBe(0);
    expect(partial.result?.coverage.chords).toEqual([]);
    expect(partial.message).toContain('Chord progression is incomplete');
    complete.mockImplementation(async () => ({ text: JSON.stringify({ ...empty, findings: [0,1,2,3].map(beat => ({ ...chord,
      annotation: { ...chord.annotation, position: { measure: 1, offset: createRationalDuration(beat, 4) } },
      evidence: [{ measure: 1, voiceId: 'voice-1', offset: createRationalDuration(beat, 4) }],
    })) }), tokens: 100 }));
    await coordinator.request({ context: source });
    const done = await settled(coordinator);
    expect(done.status).toBe('current'); expect(done.completedMeasures).toBe(1);
    expect(done.result?.findings).toHaveLength(4);
  });
  it('accounts for ornaments and repeated attacks without adding a chord label at every note', () => {
    const snapshot = createScoreSnapshot({ ...context('X:1\nM:4/4\nL:1/4\nK:C\nC D E G | z4 |]'), snapshotId: 'ornaments' });
    const raw = { ...empty, findings: [chord], chordContinuations: [{ measure: 1,
      offsets: [1,2,3].map(numerator => ({ numerator, denominator: 4 })) }] };
    const parsed = parseAnalysisResponse(JSON.stringify(raw), snapshot, ['chords'], [1,2], 'r');
    expect(parsed.findings).toHaveLength(1); expect(parsed.chordCoverage).toEqual([1,2]);
    expect(() => parseAnalysisResponse(JSON.stringify({ ...raw, chordContinuations: [{ measure: 1,
      offsets: [{ numerator: 1, denominator: 8 }] }] }), snapshot, ['chords'], [1,2], 'r')).toThrow('existing note');
    expect(() => parseAnalysisResponse(JSON.stringify({ ...raw, chordContinuations: [{ measure: 1,
      offsets: [{ numerator: 0, denominator: 1 }] }] }), snapshot, ['chords'], [1,2], 'r')).toThrow();
    expect(() => parseAnalysisResponse(JSON.stringify({ ...raw, chordContinuations: [{ measure: 1,
      offsets: [{ numerator: 1, denominator: 4 }, { numerator: 2, denominator: 8 }] }] }), snapshot, ['chords'], [1,2], 'r')).toThrow('Duplicate chord coverage');
    expect(() => parseAnalysisResponse(JSON.stringify({ ...raw, findings: [] }), snapshot, ['chords'], [1,2], 'r')).toThrow('preceding chord');
  });
  it('does not count empty findings or a measure-spanning chord as coverage for unexamined note onsets', () => {
    const snapshot = createScoreSnapshot({ ...context(), snapshotId: 's' });
    expect(parseAnalysisResponse(JSON.stringify(empty), snapshot, ['chords'], [1,2,3,4], 'r').chordCoverage).toEqual([]);
    const spanning = { ...chord, annotation: { ...chord.annotation, span: { startMeasure: 1, endMeasure: 4 } } };
    expect(parseAnalysisResponse(JSON.stringify({ ...empty, findings: [spanning] }), snapshot, ['chords'], [1,2,3,4], 'r').chordCoverage).toEqual([1]);
  });
  it('bounds dense chord passages and reconciles even a short score split into multiple windows', async () => {
    const complete = vi.fn(response); const { coordinator, store } = await setup(complete);
    await coordinator.preferences('score-1', { lenses: ['chords','cadences','modulation'], autoRefresh: true });
    const source = context('X:1\nM:4/4\nL:1/4\nK:Cm\n' + '[CEG] [ACEF] [=B,DG] [CEG] | '.repeat(12) + '[CEG]4 |]');
    await coordinator.request({ context: source }); const done = await settled(coordinator);
    expect(done.status).toBe('current'); expect(done.completedMeasures).toBe(13); expect(done.result?.reconciled).toBe(true);
    const prompts = complete.mock.calls.map(([input]) => JSON.parse(input.prompt));
    expect(prompts[0].chordReviewOnsets.flatMap((m: { offsets: unknown[] }) => m.offsets)).toHaveLength(32);
    expect(prompts.slice(0,2).flatMap(p => p.targetMeasures)).toEqual(Array.from({ length: 13 }, (_,i) => i+1));
    expect(prompts[2].task).toContain('whole written score');
    const reloaded = new ScoreAnalysisCoordinator(store, complete);
    expect((await reloaded.observe(source)).status).toBe('current');
    expect((await reloaded.get('score-1')).result?.chordContinuations).toHaveLength(13);
    expect(complete).toHaveBeenCalledTimes(3);
  });
  it('invalidates selective legacy caches and checks persisted chord coverage against actual findings', async () => {
    const { coordinator, store } = await setup();
    await coordinator.request({ context: context() }); await settled(coordinator);
    const file = path.join(store.analysisDirectory, 'score-analysis.v1.json');
    const cache = JSON.parse(await readFile(file, 'utf8'));
    const result = cache.documents[0].results[0];
    result.findings = [result.findings[0]];
    await writeFile(file, JSON.stringify(cache));
    const reloaded = new ScoreAnalysisCoordinator(store, response);
    const partial = await reloaded.observe(context());
    expect(partial.status).toBe('partial'); expect(partial.completedMeasures).toBe(1);
    expect(partial.result?.coverage.chords).toEqual([1]);
    result.fingerprint = result.fingerprint.replace(/^v2-/, 'v1-');
    await writeFile(file, JSON.stringify(cache));
    expect((await new ScoreAnalysisCoordinator(store, response).observe(context())).result).toBeUndefined();
  });
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
    const complete = vi.fn(response);
    const { coordinator } = await setup(complete); const source = context();
    await coordinator.request({ context: source }); const done = await settled(coordinator);
    expect(done.result?.findings).toHaveLength(4); expect(source.annotations).toEqual([]); expect(source.abc).toBe(abc);
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
    await coordinator.request({ context: context('X:1\nM:4/4\nL:1/4\nK:C\nC4 |]') }); const done = await settled(coordinator);
    expect(done.status).toBe('current'); expect(done.result?.findings).toHaveLength(1);
    expect(received.model).toBe('analysis'); expect(received.tools).toBeUndefined();
    expect(received.max_tokens ?? received.max_completion_tokens).toBeLessThanOrEqual(8192);
    expect(authorization).toBe('Bearer private-analysis-test-secret'); expect(store.getSelection()?.modelId).toBe('chat');
  });
});
