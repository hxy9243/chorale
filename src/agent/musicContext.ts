import type { MusicContextSnapshot } from './types';
import type { Annotation, ScoreAnchor } from '../types/document';

export type MusicContextSnapshotInput = Omit<
  MusicContextSnapshot,
  'selection' | 'annotations'
> & Readonly<{
  selection?: ScoreAnchor | null;
  annotations: readonly Annotation[];
}>;

const copyAnnotation = (annotation: Annotation): Annotation => {
  const agentProfiles = annotation.agentProfiles
    ? Object.freeze([...annotation.agentProfiles]) as Annotation['agentProfiles']
    : undefined;
  if (annotation.kind === 'chord') {
    return Object.freeze({
      ...annotation,
      span: Object.freeze({ ...annotation.span }),
      position: Object.freeze({
        ...annotation.position,
        offset: Object.freeze({ ...annotation.position.offset }),
      }),
      ...(agentProfiles ? { agentProfiles } : {}),
    });
  }
  return Object.freeze({
    ...annotation,
    span: Object.freeze({ ...annotation.span }),
    ...(agentProfiles ? { agentProfiles } : {}),
  });
};

export const createMusicContextSnapshot = (
  input: MusicContextSnapshotInput,
): MusicContextSnapshot => Object.freeze({
  id: input.id,
  documentId: input.documentId,
  revision: input.revision,
  capturedAt: input.capturedAt,
  fileName: input.fileName,
  abc: input.abc,
  ...(input.selection
    ? { selection: Object.freeze({ ...input.selection }) }
    : {}),
  annotations: Object.freeze(input.annotations.map(copyAnnotation)),
});
