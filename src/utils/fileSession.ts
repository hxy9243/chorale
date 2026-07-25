import type { FileDocument, ScoreVersion } from '../types/document';
import type { MusicSample } from '../types/music';

export function generateId(prefix = 'file'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

  return {
    id,
    name,
    sourceType,
    abcSource,
    revision: 1,
    scoreInfo: {
      title: title || name.replace(/\.(xml|musicxml|mxl|abc)$/i, ''),
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
  reason: ScoreVersion['reason'] = 'manual-edit'
): FileDocument {
  if (doc.abcSource === newAbc) return doc;

  const now = new Date().toISOString();
  const nextRevision = doc.revision + 1;
  const newVersion: ScoreVersion = {
    revision: nextRevision,
    abcSource: newAbc,
    createdAt: now,
    reason,
  };

  return {
    ...doc,
    abcSource: newAbc,
    revision: nextRevision,
    versions: [...doc.versions, newVersion],
    updatedAt: now,
  };
}

export function sampleToDocument(sample: MusicSample, abcSource: string): FileDocument {
  return createDocumentFromAbc(
    `${sample.title} (${sample.type.toUpperCase()})`,
    sample.type,
    abcSource,
    sample.title
  );
}
