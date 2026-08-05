import type {
  AgentProfileId,
  Annotation,
  AnnotationBase,
  AnnotationProposal,
  FileDocument,
  MeasureSpan,
  ScoreInfo,
  ScoreVersion,
} from '../types/document';
import { isRationalDuration } from './rational';

type UnknownRecord = Record<string, unknown>;

const PROFILE_IDS: AgentProfileId[] = [
  'general',
  'harmony',
  'voice-leading',
  'form-phrase',
];

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const nonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value : null
);

const optionalString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value : undefined
);

const normalizeMeasureSpan = (value: unknown): MeasureSpan | null => {
  if (!isRecord(value)) return null;
  const { startMeasure, endMeasure } = value;
  if (
    !Number.isInteger(startMeasure)
    || !Number.isInteger(endMeasure)
    || (startMeasure as number) <= 0
    || (endMeasure as number) < (startMeasure as number)
  ) {
    return null;
  }
  return { startMeasure: startMeasure as number, endMeasure: endMeasure as number };
};

const normalizeAnnotationSpan = (value: UnknownRecord): MeasureSpan | null => {
  const canonical = normalizeMeasureSpan(value.span);
  if (canonical) return canonical;

  const anchor = isRecord(value.anchor) ? value.anchor : {};
  const startMeasure = anchor.startMeasure ?? anchor.measure ?? value.measureStart;
  const endMeasure = anchor.endMeasure ?? value.measureEnd ?? startMeasure;
  return normalizeMeasureSpan({ startMeasure, endMeasure });
};

const normalizeProfiles = (value: unknown): AgentProfileId[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const profiles = value.filter((profile): profile is AgentProfileId => (
    typeof profile === 'string' && PROFILE_IDS.includes(profile as AgentProfileId)
  ));
  return profiles.length ? [...new Set(profiles)] : undefined;
};

const normalizeAnnotationBase = (value: UnknownRecord): AnnotationBase | null => {
  const id = nonEmptyString(value.id);
  const span = normalizeAnnotationSpan(value);
  const label = nonEmptyString(value.label);
  const body = nonEmptyString(value.body) || nonEmptyString(value.description);
  const createdAt = nonEmptyString(value.createdAt);
  const updatedAt = nonEmptyString(value.updatedAt);
  if (
    !id
    || !span
    || !label
    || !body
    || !createdAt
    || !updatedAt
    || (value.source !== 'user' && value.source !== 'assistant')
  ) {
    return null;
  }

  const agentProfiles = normalizeProfiles(value.agentProfiles);
  return {
    id,
    span,
    label,
    body,
    source: value.source,
    ...(agentProfiles ? { agentProfiles } : {}),
    createdAt,
    updatedAt,
  };
};

export const validateAnnotation = (value: unknown): Annotation | null => {
  if (!isRecord(value)) return null;
  if (
    value.kind !== 'chord'
    && value.kind !== 'modulation'
    && value.kind !== 'voice-leading'
    && value.kind !== 'explanation'
  ) {
    return null;
  }
  const base = normalizeAnnotationBase(value);
  if (!base) return null;

  if (value.kind === 'chord') {
    if (!isRecord(value.position)) {
      return null;
    }
    const measure = value.position.measure;
    const chordSymbol = nonEmptyString(value.chordSymbol);
    if (
      !Number.isInteger(measure)
      || (measure as number) < base.span.startMeasure
      || (measure as number) > base.span.endMeasure
      || !isRationalDuration(value.position.offset)
      || !chordSymbol
    ) {
      return null;
    }
    const romanNumeral = optionalString(value.romanNumeral);
    return {
      ...base,
      kind: 'chord',
      position: { measure: measure as number, offset: { ...value.position.offset } },
      chordSymbol,
      ...(romanNumeral ? { romanNumeral } : {}),
    };
  }

  if (
    value.kind !== 'modulation'
    && value.kind !== 'voice-leading'
    && value.kind !== 'explanation'
  ) {
    return null;
  }
  return { ...base, kind: value.kind };
};

export const normalizeAnnotation = (value: unknown): Annotation | null => {
  const canonical = validateAnnotation(value);
  if (canonical) return canonical;
  if (!isRecord(value)) return null;
  if (
    value.kind === 'chord'
    || value.kind === 'modulation'
    || value.kind === 'voice-leading'
    || value.kind === 'explanation'
  ) {
    return null;
  }
  const base = normalizeAnnotationBase(value);
  if (!base) return null;

  if (value.kind === 'harmony') {
    const recoveredChord = validateAnnotation({ ...value, kind: 'chord' });
    if (recoveredChord) return recoveredChord;
  }
  return { ...base, kind: 'explanation' };
};

export const validateAnnotationProposal = (value: unknown): AnnotationProposal | null => {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const runId = nonEmptyString(value.runId);
  const documentId = nonEmptyString(value.documentId);
  const annotation = validateAnnotation(value.annotation);
  if (
    !id
    || !runId
    || !documentId
    || !Number.isSafeInteger(value.sourceRevision)
    || (value.sourceRevision as number) <= 0
    || !['proposed', 'accepted', 'rejected', 'outdated', 'unavailable'].includes(value.state as string)
    || !annotation
    || annotation.source !== 'assistant'
  ) {
    return null;
  }
  return {
    id,
    runId,
    documentId,
    sourceRevision: value.sourceRevision as number,
    state: value.state as AnnotationProposal['state'],
    annotation,
  };
};

const normalizeScoreInfo = (value: unknown): ScoreInfo => {
  if (!isRecord(value)) return {};
  const measures = Number.isInteger(value.measures) && (value.measures as number) >= 0
    ? value.measures as number
    : undefined;
  return {
    ...(optionalString(value.title) ? { title: optionalString(value.title) } : {}),
    ...(optionalString(value.subtitle) ? { subtitle: optionalString(value.subtitle) } : {}),
    ...(optionalString(value.composer) ? { composer: optionalString(value.composer) } : {}),
    ...(optionalString(value.key) ? { key: optionalString(value.key) } : {}),
    ...(optionalString(value.meter) ? { meter: optionalString(value.meter) } : {}),
    ...(optionalString(value.tempoText) ? { tempoText: optionalString(value.tempoText) } : {}),
    ...(measures !== undefined ? { measures } : {}),
  };
};

const normalizeVersion = (value: unknown): ScoreVersion | null => {
  if (!isRecord(value)) return null;
  const abcSource = typeof value.abcSource === 'string' ? value.abcSource : null;
  const createdAt = nonEmptyString(value.createdAt);
  if (
    !Number.isInteger(value.revision)
    || (value.revision as number) <= 0
    || abcSource === null
    || !createdAt
    || !['import', 'manual-edit', 'tool-apply', 'restore'].includes(value.reason as string)
  ) {
    return null;
  }
  return {
    revision: value.revision as number,
    abcSource,
    createdAt,
    reason: value.reason as ScoreVersion['reason'],
  };
};

export const normalizeFileDocument = (value: unknown): FileDocument | null => {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const abcSource = typeof value.abcSource === 'string' ? value.abcSource : null;
  const createdAt = nonEmptyString(value.createdAt);
  const updatedAt = nonEmptyString(value.updatedAt);
  if (
    !id
    || !name
    || !['musicxml', 'mxl', 'xml', 'abc'].includes(value.sourceType as string)
    || abcSource === null
    || !Number.isInteger(value.revision)
    || (value.revision as number) <= 0
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  const annotations = Array.isArray(value.annotations)
    ? value.annotations.flatMap((annotation) => {
        const normalized = normalizeAnnotation(annotation);
        return normalized ? [normalized] : [];
      })
    : [];
  const chats = Array.isArray(value.chats)
    ? value.chats.flatMap((chat) => {
        if (!isRecord(chat)) return [];
        const chatId = nonEmptyString(chat.id);
        const title = nonEmptyString(chat.title);
        const chatUpdatedAt = nonEmptyString(chat.updatedAt);
        if (!chatId || !title || !chatUpdatedAt || !Number.isInteger(chat.messageCount)) return [];
        return [{
          id: chatId,
          title,
          messageCount: Math.max(0, chat.messageCount as number),
          updatedAt: chatUpdatedAt,
        }];
      })
    : [];
  const versions = Array.isArray(value.versions)
    ? value.versions.flatMap((version) => {
        const normalized = normalizeVersion(version);
        return normalized ? [normalized] : [];
      })
    : [];

  return {
    id,
    name,
    sourceType: value.sourceType as FileDocument['sourceType'],
    abcSource,
    revision: value.revision as number,
    scoreInfo: normalizeScoreInfo(value.scoreInfo),
    annotations,
    chats,
    versions,
    createdAt,
    updatedAt,
  };
};
