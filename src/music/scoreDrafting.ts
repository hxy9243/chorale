import type { Annotation, MeasureSpan } from '../types/document';
import { validateKeySignature, validateMeter } from '../utils/abcMetadata';
import { extractScore } from './scoreSnapshot';
import type { ExtractedScore, VoiceMeasureSource, WrittenMeasure } from './scoreSnapshot';

export const MIN_DRAFT_MEASURES = 1;
export const MAX_DRAFT_MEASURES = 256;
export const MIN_DRAFT_TEMPO = 20;
export const MAX_DRAFT_TEMPO = 300;
export const MAX_SCORE_EDIT_BYTES = 2_000_000;

export type NewScoreInput = Readonly<{
  title: string;
  subtitle?: string;
  composer?: string;
  key: string;
  meter: string;
  tempo: number;
  measures: number;
}>;

export type NewScoreResult =
  | Readonly<{ status: 'valid'; abcSource: string; title: string }>
  | Readonly<{ status: 'invalid'; errors: readonly string[] }>;

export type MeasureMutation =
  | Readonly<{ kind: 'insert'; span: MeasureSpan; position: 'before' | 'after'; count: number }>
  | Readonly<{ kind: 'replace'; span: MeasureSpan; replacementAbc: string }>
  | Readonly<{ kind: 'delete'; span: MeasureSpan }>;

export type MeasureMutationResult =
  | Readonly<{ status: 'valid'; abcSource: string; affectedSpan: MeasureSpan }>
  | Readonly<{ status: 'invalid' | 'unsupported'; errors: readonly string[] }>;

export const applyWholeScoreReplacement = (
  abcSource: string,
  replacementAbc: string,
): MeasureMutationResult => {
  if (!replacementAbc.trim()) {
    return { status: 'invalid', errors: ['Replacement score ABC cannot be empty.'] };
  }
  if (new TextEncoder().encode(replacementAbc).byteLength >= MAX_SCORE_EDIT_BYTES) {
    return { status: 'invalid', errors: ['Replacement score ABC must be smaller than 2 MB.'] };
  }
  if (replacementAbc === abcSource) {
    return { status: 'invalid', errors: ['Replacement score ABC must change the score.'] };
  }
  if ([...replacementAbc.matchAll(/^X:/gm)].length > 1) {
    return { status: 'invalid', errors: ['Replacement score ABC must contain only one tune.'] };
  }

  try {
    const source = extractScore(abcSource);
    const replacement = extractScore(replacementAbc);
    if (replacement.measures.length < source.measures.length) {
      return {
        status: 'invalid',
        errors: [`Replacement score cannot remove the existing ${source.measures.length} written measure${source.measures.length === 1 ? '' : 's'}.`],
      };
    }
    return {
      status: 'valid',
      abcSource: replacementAbc,
      affectedSpan: { startMeasure: 1, endMeasure: replacement.measures.length },
    };
  } catch (error) {
    return {
      status: 'invalid',
      errors: [error instanceof Error ? error.message : 'Replacement score ABC is invalid.'],
    };
  }
};

const sanitizeHeaderValue = (value: string): string => Array.from(
  value.replace(/[\r\n\u2028\u2029]+/g, ' '),
).filter((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint === 9 || (codePoint >= 32 && codePoint !== 127);
}).join('').replace(/(^|[^\\])%/g, '$1\\%').trim();

const validateIntegerRange = (
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): string | null => {
  if (!Number.isInteger(value)) return `${label} must be a whole number.`;
  if (value < minimum || value > maximum) {
    return `${label} must be between ${minimum} and ${maximum}.`;
  }
  return null;
};

export const createBlankPianoScore = (input: NewScoreInput): NewScoreResult => {
  const title = sanitizeHeaderValue(input.title);
  const subtitle = sanitizeHeaderValue(input.subtitle || '');
  const composer = sanitizeHeaderValue(input.composer || '');
  const errors: string[] = [];

  if (!title) errors.push('Title is required.');
  const key = validateKeySignature(input.key);
  if (!key.valid || !key.value) errors.push(key.error || 'Key is invalid.');
  const meter = validateMeter(input.meter);
  if (!meter.valid || !meter.value) errors.push(meter.error || 'Meter is invalid.');
  const tempoError = validateIntegerRange(input.tempo, 'Tempo', MIN_DRAFT_TEMPO, MAX_DRAFT_TEMPO);
  if (tempoError) errors.push(tempoError);
  const measureError = validateIntegerRange(
    input.measures,
    'Measures',
    MIN_DRAFT_MEASURES,
    MAX_DRAFT_MEASURES,
  );
  if (measureError) errors.push(measureError);
  if (errors.length > 0 || !key.value || !meter.value) return { status: 'invalid', errors };

  const measureRests = Array.from({ length: input.measures }, () => 'Z |').join(' ');
  const lines = [
    'X:1',
    `T:${title}`,
    ...(subtitle ? [`T:${subtitle}`] : []),
    ...(composer ? [`C:${composer}`] : []),
    `M:${meter.value}`,
    'L:1/4',
    `Q:1/4=${input.tempo}`,
    '%%score { upper | lower }',
    'V:upper clef=treble name="Piano"',
    'V:lower clef=bass',
    `K:${key.value}`,
    `[V:upper] ${measureRests}]`,
    `[V:lower] ${measureRests}]`,
    '',
  ];
  const abcSource = lines.join('\n');

  try {
    const score = extractScore(abcSource);
    if (score.measures.length !== input.measures) {
      throw new Error(`Expected ${input.measures} measures but parsed ${score.measures.length}.`);
    }
    if (score.voices.length !== 2 || !score.voices.includes('upper') || !score.voices.includes('lower')) {
      throw new Error('The generated score did not contain both piano voices.');
    }
  } catch (error) {
    return {
      status: 'invalid',
      errors: [error instanceof Error ? error.message : 'The generated ABC is invalid.'],
    };
  }

  return { status: 'valid', abcSource, title };
};

type SourceEdit = Readonly<{ start: number; end: number; replacement: string }>;

const plainBarTypes = new Set(['bar_thin', 'bar_thin_thick', 'bar_thin_thin']);

const validateSpan = (span: MeasureSpan, totalMeasures: number): string | null => {
  if (!Number.isInteger(span.startMeasure) || !Number.isInteger(span.endMeasure)) {
    return 'Measure numbers must be whole numbers.';
  }
  if (span.startMeasure < 1 || span.endMeasure < span.startMeasure || span.endMeasure > totalMeasures) {
    return `Select measures within 1–${totalMeasures}.`;
  }
  return null;
};

const sourceForVoice = (
  measure: WrittenMeasure,
  voiceId: string,
): VoiceMeasureSource | undefined => measure.voiceSources.find((source) => source.voiceId === voiceId);

const validateWritableSource = (
  measures: readonly WrittenMeasure[],
  voices: readonly string[],
  mode: 'content' | 'structure' = 'structure',
): string[] => {
  const errors: string[] = [];
  for (const measure of measures) {
    if (mode === 'structure' && (measure.keyChange || measure.meterChange)) {
      errors.push(`Measure ${measure.measureNumber} contains an inline key or meter change.`);
      continue;
    }
    for (const voiceId of voices) {
      const source = sourceForVoice(measure, voiceId);
      if (
        !source
        || source.segments.length !== 1
        || source.barRanges.length < 1
        || (mode === 'structure' && source.barRanges.length !== 1)
      ) {
        errors.push(`Measure ${measure.measureNumber}, voice ${voiceId}, does not have one isolated source segment.`);
        continue;
      }
      if (mode === 'structure' && source.segments.some((segment) => /\[Q:[^\]]+\]/i.test(segment.abcSlice))) {
        errors.push(`Measure ${measure.measureNumber}, voice ${voiceId}, contains an inline tempo change.`);
      }
      if (mode === 'structure' && source.barTypes.some((barType) => !plainBarTypes.has(barType))) {
        errors.push(`Measure ${measure.measureNumber} crosses a repeat or ending boundary.`);
      }
      const segment = source.segments[0].abcRange;
      const bar = source.barRanges.at(-1)!;
      if (bar.start < segment.start || bar.end > segment.end || bar.start >= bar.end) {
        errors.push(`Measure ${measure.measureNumber}, voice ${voiceId}, has incomplete source offsets.`);
      }
    }
  }
  return errors;
};

const applySourceEdits = (abcSource: string, edits: readonly SourceEdit[]): string | null => {
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  let previousStart = abcSource.length + 1;
  let result = abcSource;
  for (const edit of sorted) {
    if (
      !Number.isInteger(edit.start)
      || !Number.isInteger(edit.end)
      || edit.start < 0
      || edit.end < edit.start
      || edit.end > abcSource.length
      || edit.end > previousStart
    ) return null;
    result = `${result.slice(0, edit.start)}${edit.replacement}${result.slice(edit.end)}`;
    previousStart = edit.start;
  }
  return result;
};

const replacementSnapshot = (
  sourceAbc: string,
  score: ExtractedScore,
  replacementAbc: string,
): ExtractedScore => {
  const meter = sourceAbc.match(/^M:\s*(.+)$/m)?.[1]?.trim() || score.meter || '4/4';
  const unitLength = sourceAbc.match(/^L:\s*(.+)$/m)?.[1]?.trim() || '1/8';
  const key = sourceAbc.match(/^K:\s*(.+)$/m)?.[1]?.trim() || score.key || 'C';
  const explicitVoices = [...replacementAbc.matchAll(/(?:^|\n|\[)V:\s*([^\]\s]+)/g)]
    .map((match) => match[1]);
  if (score.voices.length > 1 && explicitVoices.length === 0) {
    throw new Error('Multi-voice replacement ABC must use [V:<id>] sections.');
  }
  const replacementVoices = [...new Set([...score.voices, ...explicitVoices])];
  const rawBody = score.voices.length === 1 && explicitVoices.length === 0
    ? `[V:${score.voices[0]}] ${replacementAbc}`
    : replacementAbc;
  const body = rawBody.replace(/((?:^|\n)\s*(?:\[V:[^\]]+\]|V:\s*\S+)\s*)(?!\|)/g, '$1| ');
  const voiceDeclarations = replacementVoices.map((voiceId) => `V:${voiceId}`).join('\n');
  return extractScore([
    'X:1',
    `M:${meter}`,
    `L:${unitLength}`,
    voiceDeclarations,
    `K:${key}`,
    body,
    '',
  ].join('\n'));
};

const measureContent = (source: VoiceMeasureSource): Readonly<{ start: number; end: number }> => ({
  start: source.barRanges.length > 1
    ? source.barRanges.at(-2)!.end
    : source.segments[0].abcRange.start,
  end: source.barRanges.at(-1)!.start,
});

const addVoicesToScoreDirective = (
  abcSource: string,
  voiceIds: readonly string[],
): SourceEdit | null => {
  const directive = /^%%score\s+([^\n]*)$/m.exec(abcSource);
  if (!directive || voiceIds.length === 0) return null;
  const line = directive[0];
  const closeBrace = line.lastIndexOf('}');
  const addition = ` | ${voiceIds.join(' | ')}`;
  const replacement = closeBrace >= 0
    ? `${line.slice(0, closeBrace).trimEnd()}${addition} ${line.slice(closeBrace)}`
    : `${line}${addition}`;
  return {
    start: directive.index,
    end: directive.index + line.length,
    replacement,
  };
};

const addNewVoiceEdits = (
  abcSource: string,
  score: ExtractedScore,
  replacement: ExtractedScore,
  selectedStartIndex: number,
  selectedEndIndex: number,
  newVoiceIds: readonly string[],
): SourceEdit[] | null => {
  if (newVoiceIds.length === 0) return [];
  const keyLine = /^K:[^\n]*(?:\n|$)/m.exec(abcSource);
  if (!keyLine) return null;

  const edits: SourceEdit[] = [];
  const declaredVoices = new Set(
    [...abcSource.matchAll(/^V:\s*([^\s]+)/gm)].map((match) => match[1]),
  );
  const missingDeclarations = [...score.voices, ...newVoiceIds]
    .filter((voiceId, index, voices) => !declaredVoices.has(voiceId) && voices.indexOf(voiceId) === index);
  if (missingDeclarations.length > 0) {
    edits.push({
      start: keyLine.index,
      end: keyLine.index,
      replacement: `${missingDeclarations.map((voiceId) => `V:${voiceId}`).join('\n')}\n`,
    });
  }

  if (score.voices.length === 1 && !/(?:^|\n|\[)V:\s*/.test(abcSource)) {
    const firstSource = sourceForVoice(score.measures[0], score.voices[0]);
    const firstSegment = firstSource?.segments[0];
    if (!firstSegment) return null;
    edits.push({
      start: firstSegment.abcRange.start,
      end: firstSegment.abcRange.start,
      replacement: `[V:${score.voices[0]}] `,
    });
  }

  const scoreDirectiveEdit = addVoicesToScoreDirective(abcSource, newVoiceIds);
  if (scoreDirectiveEdit) edits.push(scoreDirectiveEdit);

  const voiceLines: string[] = [];
  for (const voiceId of newVoiceIds) {
    const measures: string[] = [];
    for (const [measureIndex, targetMeasure] of score.measures.entries()) {
      const barSource = score.voices
        .map((existingVoiceId) => sourceForVoice(targetMeasure, existingVoiceId))
        .find((source) => source?.segments.length === 1 && source.barRanges.length >= 1);
      if (!barSource) return null;
      const bar = barSource.barRanges.at(-1)!;
      const barText = abcSource.slice(bar.start, bar.end).trim();
      if (!barText) return null;
      const leadingBarText = barSource.barRanges.length > 1
        ? barSource.barRanges.slice(0, -1).map((range) => abcSource.slice(range.start, range.end).trim()).join(' ')
        : '';

      let content = 'Z';
      if (measureIndex >= selectedStartIndex && measureIndex <= selectedEndIndex) {
        const replacementMeasure = replacement.measures[measureIndex - selectedStartIndex];
        const replacementSource = sourceForVoice(replacementMeasure, voiceId);
        if (!replacementSource || replacementSource.segments.length !== 1 || replacementSource.barRanges.length < 1) {
          return null;
        }
        const contentRange = measureContent(replacementSource);
        content = replacementSource.segments[0].abcSlice.slice(
          contentRange.start - replacementSource.segments[0].abcRange.start,
          contentRange.end - replacementSource.segments[0].abcRange.start,
        ).trim();
        if (!content) return null;
      }
      measures.push(`${leadingBarText ? `${leadingBarText} ` : ''}${content} ${barText}`);
    }
    voiceLines.push(`[V:${voiceId}] ${measures.join(' ')}`);
  }

  const trailingWhitespace = /\s*$/.exec(abcSource)?.[0] || '';
  const insertionPoint = abcSource.length - trailingWhitespace.length;
  edits.push({
    start: insertionPoint,
    end: insertionPoint,
    replacement: `\n${voiceLines.join('\n')}`,
  });
  return edits;
};

export const applyMeasureMutation = (
  abcSource: string,
  mutation: MeasureMutation,
): MeasureMutationResult => {
  let score: ExtractedScore;
  try {
    score = extractScore(abcSource);
  } catch (error) {
    return { status: 'invalid', errors: [error instanceof Error ? error.message : 'The score ABC is invalid.'] };
  }

  const spanError = validateSpan(mutation.span, score.measures.length);
  if (spanError) return { status: 'invalid', errors: [spanError] };
  const selectedMeasures = score.measures.slice(mutation.span.startMeasure - 1, mutation.span.endMeasure);
  const sourceErrors = validateWritableSource(
    selectedMeasures,
    score.voices,
    mutation.kind === 'replace' ? 'content' : 'structure',
  );
  if (sourceErrors.length > 0) return { status: 'unsupported', errors: sourceErrors };

  const edits: SourceEdit[] = [];
  let expectedMeasureCount = score.measures.length;
  let expectedVoiceIds = score.voices;
  let affectedSpan: MeasureSpan = mutation.span;

  if (mutation.kind === 'insert') {
    const countError = validateIntegerRange(mutation.count, 'Measures', MIN_DRAFT_MEASURES, MAX_DRAFT_MEASURES);
    if (countError) return { status: 'invalid', errors: [countError] };
    const boundaryMeasure = mutation.position === 'before' ? selectedMeasures[0] : selectedMeasures.at(-1)!;
    const insertingAtScoreEnd = mutation.position === 'after' && mutation.span.endMeasure === score.measures.length;
    for (const voiceId of score.voices) {
      const source = sourceForVoice(boundaryMeasure, voiceId)!;
      const rests = Array.from({ length: mutation.count }, () => 'Z |').join(' ');
      if (mutation.position === 'before') {
        edits.push({ start: source.segments[0].abcRange.start, end: source.segments[0].abcRange.start, replacement: `${rests} ` });
      } else if (insertingAtScoreEnd) {
        const bar = source.barRanges[0];
        const currentBar = abcSource.slice(bar.start, bar.end);
        if (currentBar !== '|]') {
          return { status: 'unsupported', errors: ['Adding after the final measure requires a standard |] ending.'] };
        }
        edits.push({ start: bar.start, end: bar.end, replacement: `| ${rests}]` });
      } else {
        const end = source.segments[0].abcRange.end;
        edits.push({ start: end, end, replacement: ` ${rests} ` });
      }
    }
    expectedMeasureCount += mutation.count;
    const startMeasure = mutation.position === 'before'
      ? mutation.span.startMeasure
      : mutation.span.endMeasure + 1;
    affectedSpan = { startMeasure, endMeasure: startMeasure + mutation.count - 1 };
  }

  if (mutation.kind === 'delete') {
    if (selectedMeasures.length === score.measures.length) {
      return { status: 'invalid', errors: ['A score must keep at least one measure.'] };
    }
    for (const measure of selectedMeasures) {
      for (const voiceId of score.voices) {
        const segment = sourceForVoice(measure, voiceId)!.segments[0].abcRange;
        edits.push({ start: segment.start, end: segment.end, replacement: '' });
      }
    }
    expectedMeasureCount -= selectedMeasures.length;
    affectedSpan = {
      startMeasure: Math.min(mutation.span.startMeasure, expectedMeasureCount),
      endMeasure: Math.min(mutation.span.startMeasure, expectedMeasureCount),
    };
  }

  if (mutation.kind === 'replace') {
    if (new TextEncoder().encode(mutation.replacementAbc).byteLength >= 64 * 1024) {
      return { status: 'invalid', errors: ['Replacement ABC must be smaller than 64 KiB.'] };
    }
    let replacement: ExtractedScore;
    try {
      replacement = replacementSnapshot(abcSource, score, mutation.replacementAbc);
    } catch (error) {
      return { status: 'invalid', errors: [error instanceof Error ? error.message : 'Replacement ABC is invalid.'] };
    }
    if (replacement.measures.length !== selectedMeasures.length) {
      return {
        status: 'invalid',
        errors: [`Replacement must contain ${selectedMeasures.length} measure${selectedMeasures.length === 1 ? '' : 's'}.`],
      };
    }
    if (score.voices.some((voiceId) => !replacement.voices.includes(voiceId))) {
      return { status: 'invalid', errors: [`Replacement must retain every existing voice: ${score.voices.join(', ')}.`] };
    }
    expectedVoiceIds = replacement.voices;
    const replacementErrors = validateWritableSource(replacement.measures, replacement.voices, 'content');
    if (replacementErrors.length > 0) return { status: 'invalid', errors: replacementErrors };
    for (const [index, targetMeasure] of selectedMeasures.entries()) {
      const replacementMeasure = replacement.measures[index];
      for (const voiceId of score.voices) {
        const targetSource = sourceForVoice(targetMeasure, voiceId)!;
        const replacementSource = sourceForVoice(replacementMeasure, voiceId)!;
        const targetContent = measureContent(targetSource);
        const newContent = measureContent(replacementSource);
        edits.push({
          start: targetContent.start,
          end: targetContent.end,
          replacement: replacementSource.segments[0].abcSlice.slice(
            newContent.start - replacementSource.segments[0].abcRange.start,
            newContent.end - replacementSource.segments[0].abcRange.start,
          ).trimEnd(),
        });
      }
    }
    const newVoiceIds = replacement.voices.filter((voiceId) => !score.voices.includes(voiceId));
    const newVoiceEdits = addNewVoiceEdits(
      abcSource,
      score,
      replacement,
      mutation.span.startMeasure - 1,
      mutation.span.endMeasure - 1,
      newVoiceIds,
    );
    if (newVoiceEdits === null) {
      return { status: 'unsupported', errors: ['The score source cannot safely declare and align the new voices.'] };
    }
    edits.push(...newVoiceEdits);
  }

  const candidate = applySourceEdits(abcSource, edits);
  if (candidate === null) {
    return { status: 'unsupported', errors: ['Selected source segments overlap or are incomplete.'] };
  }
  try {
    const candidateScore = extractScore(candidate);
    if (candidateScore.measures.length !== expectedMeasureCount) {
      return { status: 'invalid', errors: [`Expected ${expectedMeasureCount} measures after the edit, but parsed ${candidateScore.measures.length}.`] };
    }
    if (
      candidateScore.voices.length !== expectedVoiceIds.length
      || expectedVoiceIds.some((voiceId) => !candidateScore.voices.includes(voiceId))
    ) {
      return { status: 'invalid', errors: ['The edited score did not retain the expected voices.'] };
    }
  } catch (error) {
    return { status: 'invalid', errors: [error instanceof Error ? error.message : 'The edited score ABC is invalid.'] };
  }
  return { status: 'valid', abcSource: candidate, affectedSpan };
};

const shiftAnnotationMeasure = (annotation: Annotation, threshold: number, delta: number): Annotation => {
  const shift = (measure: number) => measure >= threshold ? measure + delta : measure;
  return annotation.kind === 'chord'
    ? {
        ...annotation,
        span: {
          startMeasure: shift(annotation.span.startMeasure),
          endMeasure: shift(annotation.span.endMeasure),
        },
        position: { ...annotation.position, measure: shift(annotation.position.measure) },
      }
    : {
        ...annotation,
        span: {
          startMeasure: shift(annotation.span.startMeasure),
          endMeasure: shift(annotation.span.endMeasure),
        },
      };
};

export const rebaseAnnotationsForMutation = (
  annotations: readonly Annotation[],
  mutation: MeasureMutation,
): Annotation[] => {
  if (mutation.kind === 'replace') return [...annotations];
  if (mutation.kind === 'insert') {
    const insertionMeasure = mutation.position === 'before'
      ? mutation.span.startMeasure
      : mutation.span.endMeasure + 1;
    return annotations.map((annotation) => {
      const shifted = shiftAnnotationMeasure(annotation, insertionMeasure, mutation.count);
      if (annotation.span.startMeasure < insertionMeasure && annotation.span.endMeasure >= insertionMeasure) {
        return { ...shifted, span: { ...shifted.span, startMeasure: annotation.span.startMeasure } } as Annotation;
      }
      return shifted;
    });
  }

  const { startMeasure, endMeasure } = mutation.span;
  const deletedCount = endMeasure - startMeasure + 1;
  return annotations.flatMap((annotation): Annotation[] => {
    if (
      annotation.span.startMeasure >= startMeasure
      && annotation.span.endMeasure <= endMeasure
    ) return [];

    const mapStart = (measure: number) => {
      if (measure < startMeasure) return measure;
      if (measure > endMeasure) return measure - deletedCount;
      return startMeasure;
    };
    const mapEnd = (measure: number) => {
      if (measure < startMeasure) return measure;
      if (measure > endMeasure) return measure - deletedCount;
      return Math.max(1, startMeasure - 1);
    };
    const nextSpan = {
      startMeasure: mapStart(annotation.span.startMeasure),
      endMeasure: mapEnd(annotation.span.endMeasure),
    };
    if (nextSpan.endMeasure < nextSpan.startMeasure) nextSpan.endMeasure = nextSpan.startMeasure;
    if (annotation.kind === 'chord') {
      const positionMeasure = annotation.position.measure > endMeasure
        ? annotation.position.measure - deletedCount
        : annotation.position.measure < startMeasure
          ? annotation.position.measure
          : nextSpan.startMeasure;
      return [{ ...annotation, span: nextSpan, position: { ...annotation.position, measure: positionMeasure } }];
    }
    return [{ ...annotation, span: nextSpan }];
  });
};

export const readMeasureReplacementAbc = (
  abcSource: string,
  span: MeasureSpan,
): string => {
  const score = extractScore(abcSource);
  const spanError = validateSpan(span, score.measures.length);
  if (spanError) throw new Error(spanError);
  const measures = score.measures.slice(span.startMeasure - 1, span.endMeasure);
  const errors = validateWritableSource(measures, score.voices, 'content');
  if (errors.length > 0) throw new Error(errors.join(' '));
  const sections = score.voices.map((voiceId) => {
    const music = measures.map((measure) => sourceForVoice(measure, voiceId)!.segments[0].abcSlice.trim()).join(' ');
    return score.voices.length > 1 ? `[V:${voiceId}] ${music}` : music;
  });
  return sections.join('\n');
};
