import type {
  Annotation,
  ChordAnnotation,
  EditActionType,
  EditHistoryEntry,
  FileDocument,
} from '../types/document';
import { generateId } from './fileSession';
import { parseAbcHeaderMetadata, type ScoreMetadata } from './abcMetadata';

export const MAX_HISTORY_ENTRIES = 100;

export function generateHistoryId(): string {
  return generateId('hist');
}

export function createOriginHistoryEntry(document: FileDocument): EditHistoryEntry {
  const now = document.createdAt || new Date().toISOString();
  const title = document.scoreInfo.title || document.name || 'Untitled';
  const typeUpper = document.sourceType ? document.sourceType.toUpperCase() : 'ABC';

  return {
    id: generateHistoryId(),
    revision: 1,
    timestamp: now,
    category: 'origin',
    actionType: 'initial',
    summary: `Initial score: ${title}`,
    details: `${typeUpper} source · Origin`,
    abcSource: document.abcSource,
    scoreInfo: { ...document.scoreInfo },
    annotations: [...(document.annotations || [])],
  };
}

export function createMetadataHistoryEntry(
  doc: FileDocument,
  newAbc: string,
  updates: Partial<ScoreMetadata>
): EditHistoryEntry {
  const now = new Date().toISOString();
  const nextRevision = (doc.revision || 1) + 1;
  const newMeta = parseAbcHeaderMetadata(newAbc);

  const changedKeys = Object.keys(updates) as Array<keyof ScoreMetadata>;
  let primaryField: string | undefined;
  let summary = 'Updated metadata';

  if (changedKeys.includes('title')) {
    primaryField = 'title';
    summary = `Title → "${newMeta.title || 'Untitled'}"`;
  } else if (changedKeys.includes('key')) {
    primaryField = 'key';
    summary = `Key signature → ${newMeta.key || 'C'}`;
  } else if (changedKeys.includes('meter')) {
    primaryField = 'meter';
    summary = `Meter → ${newMeta.meter || '4/4'}`;
  } else if (changedKeys.includes('tempoBpm') || changedKeys.includes('tempoText')) {
    primaryField = 'tempo';
    summary = `Tempo → ${newMeta.tempoText || `♩ = ${newMeta.tempoBpm || 120}`}`;
  } else if (changedKeys.includes('composer')) {
    primaryField = 'composer';
    summary = `Composer → ${newMeta.composer || 'Unknown'}`;
  } else if (changedKeys.length > 0) {
    primaryField = String(changedKeys[0]);
    summary = `Updated ${primaryField}`;
  }

  return {
    id: generateHistoryId(),
    revision: nextRevision,
    timestamp: now,
    category: 'metadata',
    actionType: 'edit',
    summary,
    details: primaryField ? `Field: ${primaryField}` : undefined,
    abcSource: newAbc,
    scoreInfo: {
      ...doc.scoreInfo,
      title: newMeta.title || doc.scoreInfo.title,
      composer: newMeta.composer || doc.scoreInfo.composer,
      key: newMeta.key || doc.scoreInfo.key,
      meter: newMeta.meter || doc.scoreInfo.meter,
      tempoText: newMeta.tempoText || doc.scoreInfo.tempoText,
    },
    annotations: [...(doc.annotations || [])],
    metadataField: primaryField,
  };
}

export function createBodyHistoryEntry(
  doc: FileDocument,
  newAbc: string,
  customSummary?: string
): EditHistoryEntry {
  const now = new Date().toISOString();
  const nextRevision = (doc.revision || 1) + 1;
  const newMeta = parseAbcHeaderMetadata(newAbc);

  return {
    id: generateHistoryId(),
    revision: nextRevision,
    timestamp: now,
    category: 'body',
    actionType: 'edit',
    summary: customSummary || 'Edited ABC music body',
    details: 'Score measures & notation',
    abcSource: newAbc,
    scoreInfo: {
      ...doc.scoreInfo,
      title: newMeta.title || doc.scoreInfo.title,
      composer: newMeta.composer || doc.scoreInfo.composer,
      key: newMeta.key || doc.scoreInfo.key,
      meter: newMeta.meter || doc.scoreInfo.meter,
      tempoText: newMeta.tempoText || doc.scoreInfo.tempoText,
    },
    annotations: [...(doc.annotations || [])],
  };
}

export function createAnnotationHistoryEntry(
  doc: FileDocument,
  action: EditActionType,
  annotation: Annotation,
  nextAnnotations: Annotation[]
): EditHistoryEntry {
  const now = new Date().toISOString();

  let summary = '';
  const measureSpan = `M${annotation.span.startMeasure}${
    annotation.span.endMeasure > annotation.span.startMeasure
      ? `–M${annotation.span.endMeasure}`
      : ''
  }`;

  const chordText =
    annotation.kind === 'chord'
      ? (annotation as ChordAnnotation).chordSymbol ||
        (annotation as ChordAnnotation).romanNumeral ||
        'chord'
      : '';

  if (action === 'add') {
    if (annotation.kind === 'chord') {
      summary = `Add Chord [${chordText}] at ${measureSpan}`;
    } else if (annotation.kind === 'modulation') {
      summary = `Add Modulation at ${measureSpan}`;
    } else if (annotation.kind === 'voice-leading') {
      summary = `Add Voice-leading at ${measureSpan}`;
    } else {
      summary = `Add Explanation at ${measureSpan}`;
    }
  } else if (action === 'delete') {
    if (annotation.kind === 'chord') {
      summary = `Delete Chord [${chordText}] at ${measureSpan}`;
    } else {
      summary = `Delete ${annotation.kind} at ${measureSpan}`;
    }
  } else {
    // edit
    if (annotation.kind === 'chord') {
      summary = `Edit Chord [${chordText}] at ${measureSpan}`;
    } else {
      summary = `Edit ${annotation.kind} at ${measureSpan}`;
    }
  }

  return {
    id: generateHistoryId(),
    revision: doc.revision || 1,
    timestamp: now,
    category: 'annotation',
    actionType: action,
    summary,
    details: `${annotation.kind.toUpperCase()} · ${measureSpan}`,
    abcSource: doc.abcSource,
    scoreInfo: { ...doc.scoreInfo },
    annotations: [...nextAnnotations],
    annotationKind: annotation.kind,
  };
}

export function createBatchAnnotationsHistoryEntry(
  doc: FileDocument,
  action: EditActionType,
  annotations: readonly Annotation[],
  nextAnnotations: Annotation[]
): EditHistoryEntry {
  const now = new Date().toISOString();

  return {
    id: generateHistoryId(),
    revision: doc.revision || 1,
    timestamp: now,
    category: 'annotation',
    actionType: action,
    summary: `${action === 'add' ? 'Added' : 'Updated'} ${annotations.length} annotations`,
    details: `${annotations.length} annotations updated`,
    abcSource: doc.abcSource,
    scoreInfo: { ...doc.scoreInfo },
    annotations: [...nextAnnotations],
    annotationKind: annotations[0]?.kind,
  };
}

export function limitHistoryEntries(
  entries: EditHistoryEntry[],
  max = MAX_HISTORY_ENTRIES
): EditHistoryEntry[] {
  if (entries.length <= max) return entries;
  const first = entries[0];
  const recent = entries.slice(-(max - 1));
  return [first, ...recent];
}

export function synthesizeInitialHistory(doc: FileDocument): EditHistoryEntry[] {
  if (doc.history && doc.history.length > 0) {
    return doc.history;
  }
  return [createOriginHistoryEntry(doc)];
}
