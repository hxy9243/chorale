import type { FileDocument, ScoreInfo, ScoreVersion } from '../types/document';
import type { MusicSample } from '../types/music';

export function generateId(prefix = 'file'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function parseAbcMetadata(abc: string): Partial<ScoreInfo> {
  let title: string | undefined;
  let composer: string | undefined;
  let key: string | undefined;
  let meter: string | undefined;
  let tempoText: string | undefined;

  const lines = abc.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('T:')) {
      const val = trimmed.slice(2).trim();
      if (val && !title) title = val;
    } else if (trimmed.startsWith('C:')) {
      const val = trimmed.slice(2).trim();
      if (val && !composer) composer = val;
    } else if (trimmed.startsWith('K:')) {
      const val = trimmed.slice(2).trim();
      if (val && !key) key = val;
    } else if (trimmed.startsWith('M:')) {
      const val = trimmed.slice(2).trim();
      if (val && !meter) meter = val === 'C' ? '4/4' : val === 'C|' ? '2/2' : val;
    } else if (trimmed.startsWith('Q:')) {
      const val = trimmed.slice(2).trim();
      if (val && !tempoText) {
        const bpmMatch = val.match(/(?:1\/\d=\s*|\w+=\s*)?(\d+)/);
        if (bpmMatch) {
          tempoText = `♩ = ${bpmMatch[1]}`;
        } else {
          tempoText = val;
        }
      }
    }
  }

  return { title, composer, key, meter, tempoText };
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
    },
    versions: [...doc.versions, newVersion],
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
