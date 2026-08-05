import abcjs from 'abcjs';
import type {
  AgentProfileId,
  Annotation,
  MusicalPosition,
  RationalDuration,
} from '../types/document';
import {
  addRationalDurations,
  compareRationalDurations,
  createRationalDuration,
  createRationalDurationFromNumber,
} from './rational';

export type AbcSourceRange = Readonly<{ start: number; end: number }>;

export type ScorePitch = Readonly<{
  step: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  accidental?: string;
  octave: number;
}>;

export type MeasuredScoreEvent = Readonly<{
  type: 'note' | 'rest';
  position: MusicalPosition;
  duration: RationalDuration;
  voiceId: string;
  pitches?: readonly ScorePitch[];
  tieStart?: boolean;
  tieEnd?: boolean;
  abcRange?: AbcSourceRange;
}>;

export type WrittenMeasure = Readonly<{
  measureNumber: number;
  abcSlice: string;
  abcRange: AbcSourceRange;
  events: readonly MeasuredScoreEvent[];
  keyChange?: string;
  meterChange?: string;
}>;

export type ExtractedScore = Readonly<{
  title?: string;
  composer?: string;
  key?: string;
  meter?: string;
  tempoText?: string;
  voices: readonly string[];
  measures: readonly WrittenMeasure[];
}>;

export type ReadonlyLookup<Key, Value> = Readonly<{
  size: number;
  get(key: Key): Value | undefined;
  has(key: Key): boolean;
  entries(): IterableIterator<[Key, Value]>;
  keys(): IterableIterator<Key>;
  values(): IterableIterator<Value>;
  [Symbol.iterator](): IterableIterator<[Key, Value]>;
}>;

export type ScoreSnapshot = ExtractedScore & Readonly<{
  snapshotId: string;
  documentId: string;
  revision: number;
  abc: string;
  annotations: readonly Annotation[];
  measureIndex: ReadonlyLookup<number, WrittenMeasure>;
  eventIndex: ReadonlyLookup<number, readonly MeasuredScoreEvent[]>;
  sourceIndex: ReadonlyLookup<number, readonly MeasuredScoreEvent[]>;
  annotationIndex: ReadonlyLookup<number, readonly Annotation[]>;
}>;

export type CreateScoreSnapshotInput = Readonly<{
  snapshotId: string;
  documentId: string;
  revision: number;
  abc: string;
  annotations: readonly Annotation[];
}>;

type ParsedPitch = {
  pitch?: number;
  accidental?: string;
  startTie?: unknown;
  endTie?: unknown;
};

type ParsedElement = {
  el_type?: string;
  type?: string;
  duration?: number;
  startChar?: number;
  endChar?: number;
  pitches?: ParsedPitch[];
  rest?: unknown;
  startTriplet?: number;
  tripletMultiplier?: number;
  endTriplet?: unknown;
  root?: string;
  acc?: string;
  mode?: string;
  value?: Array<{ num?: string | number; den?: string | number }>;
};

type ParsedStaff = {
  voices?: ParsedElement[][];
};

type ParsedTune = {
  lines?: Array<{ staff?: ParsedStaff[] }>;
  metaText?: { title?: string; composer?: string };
  warnings?: string[];
  getKeySignature?: () => { root?: string; acc?: string; mode?: string };
  getMeter?: () => ParsedElement;
};

type MutableMeasure = {
  measureNumber: number;
  starts: number[];
  ends: number[];
  events: MeasuredScoreEvent[];
  keyChange?: string;
  meterChange?: string;
};

type VoiceState = {
  measureNumber: number;
  offset: RationalDuration;
  tupletMultiplier: number;
};

const ZERO_DURATION = createRationalDuration(0, 1);
const PITCH_STEPS: ScorePitch['step'][] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const formatKey = (key: { root?: string; acc?: string; mode?: string } | undefined) => {
  if (!key?.root) return undefined;
  return `${key.root}${key.acc || ''}${key.mode || ''}`;
};

const formatMeter = (meter: ParsedElement | undefined) => {
  const part = meter?.value?.[0];
  return part?.num !== undefined && part.den !== undefined
    ? `${part.num}/${part.den}`
    : undefined;
};

const collectDeclaredVoiceIds = (abc: string): string[] => {
  const ids: string[] = [];
  const add = (id: string) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const match of abc.matchAll(/^V:\s*([^\s]+)/gm)) add(match[1]);
  for (const match of abc.matchAll(/\[V:\s*([^\]\s]+)/g)) add(match[1]);
  return ids;
};

const sourceRange = (element: ParsedElement): AbcSourceRange | undefined => (
  Number.isInteger(element.startChar)
  && Number.isInteger(element.endChar)
  && element.startChar! >= 0
  && element.endChar! >= element.startChar!
    ? { start: element.startChar!, end: element.endChar! }
    : undefined
);

const pitchFromParsed = (pitch: ParsedPitch): ScorePitch | null => {
  if (!Number.isInteger(pitch.pitch)) return null;
  const pitchNumber = pitch.pitch!;
  const stepIndex = ((pitchNumber % 7) + 7) % 7;
  return {
    step: PITCH_STEPS[stepIndex],
    ...(pitch.accidental ? { accidental: pitch.accidental } : {}),
    octave: 4 + Math.floor(pitchNumber / 7),
  };
};

const addElementRange = (measure: MutableMeasure, element: ParsedElement) => {
  const range = sourceRange(element);
  if (!range) return;
  measure.starts.push(range.start);
  measure.ends.push(range.end);
};

const warningText = (warnings: string[]) => warnings
  .map((warning) => warning.replace(/<[^>]+>/g, ''))
  .join('; ');

const createReadonlyLookup = <Key, Value>(
  entries: Iterable<readonly [Key, Value]>,
): ReadonlyLookup<Key, Value> => {
  const map = new Map<Key, Value>(entries);
  return Object.freeze({
    get size() { return map.size; },
    get: (key: Key) => map.get(key),
    has: (key: Key) => map.has(key),
    entries: () => map.entries(),
    keys: () => map.keys(),
    values: () => map.values(),
    [Symbol.iterator]: () => map[Symbol.iterator](),
  });
};

const cloneAnnotation = (annotation: Annotation): Annotation => {
  const copiedBase = {
    span: Object.freeze({ ...annotation.span }),
    ...(annotation.agentProfiles
      ? { agentProfiles: Object.freeze([...annotation.agentProfiles]) as AgentProfileId[] }
      : {}),
  };
  return annotation.kind === 'chord'
    ? Object.freeze({
        ...annotation,
        ...copiedBase,
        position: Object.freeze({
          ...annotation.position,
          offset: Object.freeze({ ...annotation.position.offset }),
        }),
      })
    : Object.freeze({ ...annotation, ...copiedBase });
};

const freezeExtractedScore = (score: ExtractedScore): ExtractedScore => {
  const measures = score.measures.map((measure) => Object.freeze({
    ...measure,
    abcRange: Object.freeze({ ...measure.abcRange }),
    events: Object.freeze(measure.events.map((event) => Object.freeze({
      ...event,
      position: Object.freeze({
        ...event.position,
        offset: Object.freeze({ ...event.position.offset }),
      }),
      duration: Object.freeze({ ...event.duration }),
      ...(event.pitches
        ? { pitches: Object.freeze(event.pitches.map((pitch) => Object.freeze({ ...pitch }))) }
        : {}),
      ...(event.abcRange ? { abcRange: Object.freeze({ ...event.abcRange }) } : {}),
    }))),
  }));
  return Object.freeze({
    ...score,
    voices: Object.freeze([...score.voices]),
    measures: Object.freeze(measures),
  });
};

export const extractScore = (abc: string): ExtractedScore => {
  if (!abc.trim()) throw new Error('ABC source is empty.');

  const parsed = abcjs.parseOnly(abc) as unknown as ParsedTune[];
  const tune = parsed[0];
  if (!tune) throw new Error('ABC source did not contain a tune.');
  if (tune.warnings?.length) {
    throw new Error(`Malformed ABC: ${warningText(tune.warnings)}`);
  }

  const declaredVoiceIds = collectDeclaredVoiceIds(abc);
  const encounteredVoiceIds: string[] = [];
  const voiceStates = new Map<string, VoiceState>();
  const measures = new Map<number, MutableMeasure>();
  let voiceSlot = 0;

  const getMeasure = (measureNumber: number) => {
    let measure = measures.get(measureNumber);
    if (!measure) {
      measure = { measureNumber, starts: [], ends: [], events: [] };
      measures.set(measureNumber, measure);
    }
    return measure;
  };

  for (const line of tune.lines || []) {
    voiceSlot = 0;
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        const voiceId = declaredVoiceIds[voiceSlot] || `voice-${voiceSlot + 1}`;
        if (!encounteredVoiceIds.includes(voiceId)) encounteredVoiceIds.push(voiceId);
        const state = voiceStates.get(voiceId) || {
          measureNumber: 1,
          offset: ZERO_DURATION,
          tupletMultiplier: 1,
        };

        for (const element of voice) {
          const measure = getMeasure(state.measureNumber);
          if (element.el_type === 'bar') {
            addElementRange(measure, element);
            state.measureNumber += 1;
            state.offset = ZERO_DURATION;
            continue;
          }
          if (element.el_type === 'key') {
            measure.keyChange = formatKey(element);
            addElementRange(measure, element);
            continue;
          }
          if (element.el_type === 'meter') {
            measure.meterChange = formatMeter(element);
            addElementRange(measure, element);
            continue;
          }
          if (element.el_type !== 'note' || typeof element.duration !== 'number') continue;

          if (element.startTriplet && element.tripletMultiplier) {
            state.tupletMultiplier = element.tripletMultiplier;
          }
          const duration = createRationalDurationFromNumber(
            element.duration * state.tupletMultiplier,
          );
          const range = sourceRange(element);
          const pitches = (element.pitches || [])
            .map(pitchFromParsed)
            .filter((pitch): pitch is ScorePitch => pitch !== null);
          const event: MeasuredScoreEvent = {
            type: element.rest ? 'rest' : 'note',
            position: { measure: state.measureNumber, offset: state.offset },
            duration,
            voiceId,
            ...(pitches.length ? { pitches } : {}),
            ...(element.pitches?.some((pitch) => Boolean(pitch.startTie)) ? { tieStart: true } : {}),
            ...(element.pitches?.some((pitch) => Boolean(pitch.endTie)) ? { tieEnd: true } : {}),
            ...(range ? { abcRange: range } : {}),
          };
          measure.events.push(event);
          addElementRange(measure, element);
          state.offset = addRationalDurations(state.offset, duration);
          if (element.endTriplet) state.tupletMultiplier = 1;
        }

        voiceStates.set(voiceId, state);
        voiceSlot += 1;
      }
    }
  }

  const writtenMeasures = [...measures.values()]
    .filter((measure) => measure.events.length > 0 || measure.starts.length > 0)
    .sort((left, right) => left.measureNumber - right.measureNumber)
    .map<WrittenMeasure>((measure) => {
      const start = Math.min(...measure.starts);
      const end = Math.max(...measure.ends);
      const events = [...measure.events].sort((left, right) => (
        compareRationalDurations(left.position.offset, right.position.offset)
        || left.voiceId.localeCompare(right.voiceId)
        || (left.abcRange?.start || 0) - (right.abcRange?.start || 0)
      ));
      return {
        measureNumber: measure.measureNumber,
        abcSlice: abc.slice(start, end),
        abcRange: { start, end },
        events,
        ...(measure.keyChange ? { keyChange: measure.keyChange } : {}),
        ...(measure.meterChange ? { meterChange: measure.meterChange } : {}),
      };
    });

  const tempoText = abc.match(/^Q:\s*(.+)$/m)?.[1]?.trim();
  return {
    ...(tune.metaText?.title ? { title: tune.metaText.title } : {}),
    ...(tune.metaText?.composer ? { composer: tune.metaText.composer } : {}),
    ...(formatKey(tune.getKeySignature?.()) ? { key: formatKey(tune.getKeySignature?.()) } : {}),
    ...(formatMeter(tune.getMeter?.()) ? { meter: formatMeter(tune.getMeter?.()) } : {}),
    ...(tempoText ? { tempoText } : {}),
    voices: encounteredVoiceIds.length ? encounteredVoiceIds : ['voice-1'],
    measures: writtenMeasures,
  };
};

export const createScoreSnapshot = (input: CreateScoreSnapshotInput): ScoreSnapshot => {
  if (!input.snapshotId.trim() || !input.documentId.trim()) {
    throw new Error('Score snapshot identity is required.');
  }
  if (!Number.isInteger(input.revision) || input.revision <= 0) {
    throw new Error('Score snapshot revision must be a positive integer.');
  }

  const score = freezeExtractedScore(extractScore(input.abc));
  const annotations = Object.freeze(input.annotations.map(cloneAnnotation));
  const measureIndex = createReadonlyLookup(
    score.measures.map((measure) => [measure.measureNumber, measure] as const),
  );
  const eventIndex = createReadonlyLookup(
    score.measures.map((measure) => [measure.measureNumber, measure.events] as const),
  );
  const sourceEvents = new Map<number, MeasuredScoreEvent[]>();
  for (const measure of score.measures) {
    for (const event of measure.events) {
      if (!event.abcRange) continue;
      const indexed = sourceEvents.get(event.abcRange.start) || [];
      indexed.push(event);
      sourceEvents.set(event.abcRange.start, indexed);
    }
  }
  const sourceIndex = createReadonlyLookup(
    [...sourceEvents].map(([start, events]) => [start, Object.freeze(events)] as const),
  );
  const annotationIndex = createReadonlyLookup(score.measures.map((measure) => [
    measure.measureNumber,
    Object.freeze(annotations.filter((annotation) => (
      annotation.span.startMeasure <= measure.measureNumber
      && annotation.span.endMeasure >= measure.measureNumber
    ))),
  ] as const));

  return Object.freeze({
    ...score,
    snapshotId: input.snapshotId,
    documentId: input.documentId,
    revision: input.revision,
    abc: input.abc,
    annotations,
    measureIndex,
    eventIndex,
    sourceIndex,
    annotationIndex,
  });
};
