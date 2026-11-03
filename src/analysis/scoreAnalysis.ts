import { extractScore, type ExtractedScore } from '../music/scoreSnapshot';
import { compareRationalDurations, createRationalDuration } from '../music/rational';
import { validateAnnotation } from '../music/documentSchema';
import type { Annotation } from '../types/document';
import { isAnalysisLens, type AnalysisFinding, type AnalysisLens, type ChordContinuation } from './types';

export const musicalAnalysisKey = (abc: string): string => {
  const score = extractScore(abc);
  if (!score.measures.length) throw new Error('No written measures are available to analyze.');
  const musical = JSON.stringify({ key: score.key, meter: score.meter, voices: score.voices,
    measures: score.measures.map(m => ({ number: m.measureNumber, key: m.activeKey, meter: m.activeMeter,
      events: m.events.map(({ abcRange: _range, ...event }) => event),
      bars: m.voiceSources.map(v => [v.voiceId, v.barTypes]),
    })),
    // Preserve inline musical directives and clef/transposition context, while
    // excluding presentation directives and descriptive metadata.
    directives: abc.match(/(?:^|\n)(?:K:|M:|L:|V:).*|\[(?:K|M|L|V):[^\]]*\]/g)?.map(s => s.replace(/^\s+/, '')
      .replace(/%.*$/, '').replace(/\b(?:name|nm|subname|snm)="[^"]*"/g, '').replace(/\s+/g, ' ').trim()),
  });
  let a = 2166136261, b = 5381;
  for (let i = 0; i < musical.length; i++) { a = Math.imul(a ^ musical.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ musical.charCodeAt(i); }
  // v2 requires an onset-complete chord reading, unlike earlier selective caches.
  return `v2-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${musical.length}`;
};

const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The model can suggest interpretations, but every cited event must exist. */
export const parseAnalysisResponse = (
  raw: string, score: ExtractedScore, lenses: readonly AnalysisLens[], measures: readonly number[], idPrefix: string,
  limits: { characters: number; findings: number; evidenceMeasures?: readonly number[] } = { characters: 160_000, findings: 256 },
): { findings: AnalysisFinding[]; summary: string; diagnostics: string[]; chordContinuations: ChordContinuation[]; chordCoverage: number[] } => {
  if (raw.length > limits.characters) throw new Error('Analysis response exceeds the supported limit.');
  const data: unknown = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  if (!record(data) || !Array.isArray(data.findings) || data.findings.length > limits.findings
    || !text(data.summary, 6000) || !Array.isArray(data.diagnostics) || data.diagnostics.length > 30
    || !data.diagnostics.every(d => text(d, 1000))) throw new Error('The model returned an invalid analysis format.');
  const allowed = new Set(measures), byNumber = new Map(score.measures.map(m => [m.measureNumber, m]));
  const allowedEvidence = new Set(limits.evidenceMeasures ?? measures);
  const now = new Date().toISOString();
  const findings = data.findings.map((item, i): AnalysisFinding => {
    if (!record(item) || !isAnalysisLens(item.lens) || !lenses.includes(item.lens)
      || !record(item.annotation) || !Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 64) {
      throw new Error('An analysis finding is missing valid score evidence.');
    }
    const rawAnnotation = item.annotation;
    const pickup = record(rawAnnotation.span) && rawAnnotation.span.startMeasure === 0 && Number.isSafeInteger(rawAnnotation.span.endMeasure);
    // The saved annotation format starts at 1, while written pickups are 0.
    // Validate automatic pickup findings in a translated coordinate system,
    // then restore their real musical location for the temporary score layer.
    let annotation = validateAnnotation({ ...rawAnnotation,
      ...(pickup && record(rawAnnotation.span) ? { span: { startMeasure: 1, endMeasure: Number(rawAnnotation.span.endMeasure) + 1 },
        ...(record(rawAnnotation.position) && Number.isSafeInteger(rawAnnotation.position.measure) ? { position: { ...rawAnnotation.position, measure: Number(rawAnnotation.position.measure) + 1 } } : {}),
      } : {}), id: `${idPrefix}-${i}`, source: 'assistant', createdAt: now, updatedAt: now });
    if (annotation && pickup) annotation = annotation.kind === 'chord'
      ? { ...annotation, span: { startMeasure: 0, endMeasure: annotation.span.endMeasure - 1 }, position: { ...annotation.position, measure: annotation.position.measure - 1 } }
      : { ...annotation, span: { startMeasure: 0, endMeasure: annotation.span.endMeasure - 1 } };
    if (!annotation || !text(annotation.label, 300) || !text(annotation.body, 6000)
      || !allowed.has(annotation.span.startMeasure) || !allowed.has(annotation.span.endMeasure)
      || (item.lens === 'chords' ? annotation.kind !== 'chord'
        : item.lens === 'modulation' ? annotation.kind !== 'modulation'
        : item.lens === 'voice-leading' ? annotation.kind !== 'voice-leading' : annotation.kind !== 'explanation')) {
      throw new Error('An analysis finding has an invalid kind or musical location.');
    }
    const evidence = item.evidence.map(e => {
      if (!record(e) || !record(e.offset) || !text(e.voiceId, 300) || !Number.isSafeInteger(e.measure)
        || !Number.isSafeInteger(e.offset.numerator) || !Number.isSafeInteger(e.offset.denominator)
        || Number(e.offset.numerator) < 0 || Number(e.offset.denominator) <= 0
        || !allowedEvidence.has(Number(e.measure))) throw new Error('Invalid analysis evidence position.');
      const offset = { numerator: Number(e.offset.numerator), denominator: Number(e.offset.denominator) };
      if (!byNumber.get(Number(e.measure))?.events.some(event => event.voiceId === e.voiceId
        && event.type === 'note' && compareRationalDurations(event.position.offset, offset) === 0)) {
        throw new Error('The analysis cited a note that does not exist in the score.');
      }
      return { measure: Number(e.measure), offset, voiceId: e.voiceId };
    });
    if (annotation.kind === 'chord' && !evidence.some(e => e.measure === annotation.position.measure
      && compareRationalDurations(e.offset, annotation.position.offset) === 0)) {
      throw new Error('The chord onset has no supporting score event.');
    }
    if (!evidence.some(e => e.measure >= annotation.span.startMeasure && e.measure <= annotation.span.endMeasure)) {
      throw new Error('The finding has no supporting event in its annotated range.');
    }
    return { lens: item.lens, annotation, evidence };
  });
  const rawContinuations = data.chordContinuations ?? [];
  if (!Array.isArray(rawContinuations) || rawContinuations.length > measures.length
    || (rawContinuations.length && !lenses.includes('chords'))) throw new Error('Invalid chord continuation coverage.');
  const chordPositions = findings.flatMap(f => f.lens === 'chords' && f.annotation.kind === 'chord' ? [f.annotation.position] : []);
  const positionKey = (measure: number, offset: { numerator: number; denominator: number }) => `${measure}:${offset.numerator}/${offset.denominator}`;
  const accounted = new Set<string>();
  for (const position of chordPositions) {
    const key = positionKey(position.measure, position.offset);
    if (accounted.has(key)) throw new Error('Duplicate chord labels at the same onset.');
    accounted.add(key);
  }
  const continuationMeasures = new Set<number>();
  const chordContinuations: ChordContinuation[] = rawContinuations.map(item => {
    if (!record(item) || !Number.isSafeInteger(item.measure) || !allowed.has(Number(item.measure))
      || continuationMeasures.has(Number(item.measure)) || !Array.isArray(item.offsets)
      || item.offsets.length > (byNumber.get(Number(item.measure))?.events.length ?? 0)) {
      throw new Error('Invalid chord continuation coverage.');
    }
    const measure = Number(item.measure);
    continuationMeasures.add(measure);
    const offsets = item.offsets.map(value => {
      if (!record(value) || !Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator)
        || Number(value.numerator) < 0 || Number(value.denominator) <= 0) throw new Error('Invalid chord continuation offset.');
      const offset = createRationalDuration(Number(value.numerator), Number(value.denominator));
      if (!byNumber.get(measure)?.events.some(e => e.type === 'note' && compareRationalDurations(e.position.offset, offset) === 0)
        || !chordPositions.some(p => p.measure === measure && compareRationalDurations(p.offset, offset) < 0)) {
        throw new Error('A chord continuation needs an existing note and a preceding chord in the same measure.');
      }
      const key = positionKey(measure, offset);
      if (accounted.has(key)) throw new Error('Duplicate chord coverage at the same onset.');
      accounted.add(key);
      return offset;
    });
    return { measure, offsets };
  });
  const chordCoverage = lenses.includes('chords') ? measures.filter(measure => byNumber.get(measure)?.events
    .filter(e => e.type === 'note').every(e => accounted.has(positionKey(measure, e.position.offset)))) : [];
  return { findings, summary: data.summary, diagnostics: data.diagnostics as string[], chordContinuations, chordCoverage };
};

export const keepAnalysisFinding = (finding: AnalysisFinding, providerName: string, modelName: string): Annotation => {
  const now = new Date().toISOString(), annotation = finding.annotation;
  const kept = { ...annotation, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
    body: `${annotation.body}\n\nAI analysis · ${providerName} · ${modelName}` };
  if (annotation.span.startMeasure !== 0) return kept;
  // Keep the existing persisted annotation contract. The action explicitly
  // tells the user that pickup commentary is saved beside the first full bar.
  return { ...kept, kind: 'explanation', label: `Pickup · ${annotation.label}`,
    span: { startMeasure: 1, endMeasure: Math.max(1, annotation.span.endMeasure) },
    body: `Pickup (m. 0)${annotation.kind === 'chord' ? ` · ${annotation.chordSymbol}${annotation.romanNumeral ? ` (${annotation.romanNumeral})` : ''}` : ''}\n\n${kept.body}` };
};
