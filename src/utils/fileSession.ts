import type { FileDocument, ScoreInfo, ScoreVersion } from '../types/document';
import type { MusicSample } from '../types/music';

export const MAX_SCORE_VERSIONS = 20;

export function limitScoreVersions(versions: ScoreVersion[]): ScoreVersion[] {
  if (versions.length <= MAX_SCORE_VERSIONS) return versions;

  const firstVersion = versions[0];
  const recentVersions = versions.slice(-(MAX_SCORE_VERSIONS - 1));
  return [firstVersion, ...recentVersions];
}

export function generateId(prefix = 'file'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

import { parseAbcHeaderMetadata, updateAbcHeaderMetadata } from './abcMetadata';
import {
  createBodyHistoryEntry,
  createOriginHistoryEntry,
  limitHistoryEntries,
} from './fileHistory';

export function parseAbcMetadata(abc: string): Partial<ScoreInfo> {
  const meta = parseAbcHeaderMetadata(abc);
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    composer: meta.composer,
    key: meta.key,
    meter: meta.meter,
    tempoText: meta.tempoText,
  };
}

export function createDocumentFromAbc(
  name: string,
  sourceType: 'musicxml' | 'mxl' | 'xml' | 'abc',
  abcSource: string,
  title?: string
): FileDocument {
  const now = new Date().toISOString();
  const id = generateId('doc');
  const initialVersion: ScoreVersion = {
    revision: 1,
    abcSource,
    createdAt: now,
    reason: 'import',
  };

  const parsedMeta = parseAbcMetadata(abcSource);

  const docBase: FileDocument = {
    id,
    name,
    sourceType,
    abcSource,
    revision: 1,
    scoreInfo: {
      title: title || parsedMeta.title || name.replace(/\.(xml|musicxml|mxl|abc)$/i, ''),
      subtitle: parsedMeta.subtitle,
      composer: parsedMeta.composer,
      key: parsedMeta.key,
      meter: parsedMeta.meter,
      tempoText: parsedMeta.tempoText,
    },
    annotations: [],
    chats: [],
    versions: [initialVersion],
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...docBase,
    history: [createOriginHistoryEntry(docBase)],
    historyIndex: 0,
  };
}

export function updateDocumentAbc(
  doc: FileDocument,
  newAbc: string,
  reason: ScoreVersion['reason'] = 'manual-edit',
  scoreInfoOverrides?: Partial<ScoreInfo>,
): FileDocument {
  const hasScoreInfoOverrides = scoreInfoOverrides !== undefined
    && Object.keys(scoreInfoOverrides).length > 0;
  if (doc.abcSource === newAbc) {
    if (!hasScoreInfoOverrides) return doc;
    return {
      ...doc,
      scoreInfo: { ...doc.scoreInfo, ...scoreInfoOverrides },
      updatedAt: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  const nextRevision = doc.revision + 1;
  const newVersion: ScoreVersion = {
    revision: nextRevision,
    abcSource: newAbc,
    createdAt: now,
    reason,
  };

  const parsedMeta = parseAbcMetadata(newAbc);
  const currentHistory = doc.history && doc.history.length > 0
    ? doc.history
    : [createOriginHistoryEntry(doc)];
  const currentIndex = doc.historyIndex !== undefined && doc.historyIndex >= 0 && doc.historyIndex < currentHistory.length
    ? doc.historyIndex
    : currentHistory.length - 1;
  const trimmedHistory = currentHistory.slice(0, currentIndex + 1);
  const historyEntry = createBodyHistoryEntry(doc, newAbc);
  const nextHistory = limitHistoryEntries([...trimmedHistory, historyEntry]);

  return {
    ...doc,
    abcSource: newAbc,
    revision: nextRevision,
    scoreInfo: {
      ...doc.scoreInfo,
      title: parsedMeta.title || doc.scoreInfo.title,
      subtitle: parsedMeta.subtitle,
      composer: parsedMeta.composer || doc.scoreInfo.composer,
      key: parsedMeta.key || doc.scoreInfo.key,
      meter: parsedMeta.meter || doc.scoreInfo.meter,
      tempoText: parsedMeta.tempoText || doc.scoreInfo.tempoText,
      ...scoreInfoOverrides,
    },
    versions: limitScoreVersions([...doc.versions, newVersion]),
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
    updatedAt: now,
  };
}

export function sampleToDocument(sample: MusicSample, abcSource: string): FileDocument {
  const document = createDocumentFromAbc(
    `${sample.title} (${sample.type.toUpperCase()})`,
    sample.type,
    abcSource,
    sample.title
  );
  return {
    ...document,
    scoreInfo: {
      ...document.scoreInfo,
      composer: sample.composer || document.scoreInfo.composer,
    },
  };
}

const SOURCE_EXTENSION_PATTERN = /\.(xml|musicxml|mxl|abc)$/i;

/**
 * Builds a new document from the source's current score state as
 * "<original title> (Copy)". The duplicate receives fresh document and
 * annotation identities and starts its own version and editing history.
 */
export function duplicateDocument(source: FileDocument): FileDocument {
  const baseTitle = source.scoreInfo.title
    || source.name.replace(SOURCE_EXTENSION_PATTERN, '');
  const copyTitle = `${baseTitle} (Copy)`;

  const extensionMatch = source.name.match(SOURCE_EXTENSION_PATTERN);
  const copyName = extensionMatch
    ? `${source.name.slice(0, -extensionMatch[0].length)} (Copy)${extensionMatch[0]}`
    : `${source.name} (Copy)`;

  const copyAbc = updateAbcHeaderMetadata(source.abcSource, { title: copyTitle });
  const baseCopy = createDocumentFromAbc(
    copyName,
    source.sourceType,
    copyAbc,
    copyTitle,
  );
  const annotations = source.annotations.map((annotation) => ({
    ...structuredClone(annotation),
    id: generateId('ann'),
  }));
  const copy: FileDocument = {
    ...baseCopy,
    scoreInfo: {
      ...source.scoreInfo,
      title: copyTitle,
    },
    annotations,
    chats: [],
  };

  return {
    ...copy,
    history: [createOriginHistoryEntry(copy)],
    historyIndex: 0,
  };
}
