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

import { parseAbcHeaderMetadata } from './abcMetadata';

export function parseAbcMetadata(abc: string): Partial<ScoreInfo> {
  const meta = parseAbcHeaderMetadata(abc);
  return {
    title: meta.title,
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

  return {
    id,
    name,
    sourceType,
    abcSource,
    revision: 1,
    scoreInfo: {
      title: title || parsedMeta.title || name.replace(/\.(xml|musicxml|mxl|abc)$/i, ''),
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

  return {
    ...doc,
    abcSource: newAbc,
    revision: nextRevision,
    scoreInfo: {
      ...doc.scoreInfo,
      title: parsedMeta.title || doc.scoreInfo.title,
      composer: parsedMeta.composer || doc.scoreInfo.composer,
      key: parsedMeta.key || doc.scoreInfo.key,
      meter: parsedMeta.meter || doc.scoreInfo.meter,
      tempoText: parsedMeta.tempoText || doc.scoreInfo.tempoText,
      ...scoreInfoOverrides,
    },
    versions: limitScoreVersions([...doc.versions, newVersion]),
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
