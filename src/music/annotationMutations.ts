import type { Annotation, AnnotationId, FileDocument } from '../types/document';
import { validateAnnotation } from './documentSchema';

export class AnnotationMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationMutationError';
  }
}

const requireAnnotation = (value: unknown): Annotation => {
  const annotation = validateAnnotation(value);
  if (!annotation) throw new AnnotationMutationError('Annotation is invalid.');
  return annotation;
};

const mutationTimestamp = (now?: string) => now ?? new Date().toISOString();

export const appendDocumentAnnotations = (
  document: FileDocument,
  values: readonly unknown[],
  now?: string,
): FileDocument => {
  if (values.length === 0) return document;
  const annotations = values.map(requireAnnotation);
  const ids = new Set(document.annotations.map(({ id }) => id));
  for (const annotation of annotations) {
    if (ids.has(annotation.id)) {
      throw new AnnotationMutationError(`Annotation ID already exists: ${annotation.id}`);
    }
    ids.add(annotation.id);
  }
  return {
    ...document,
    annotations: [...document.annotations, ...annotations],
    updatedAt: mutationTimestamp(now),
  };
};

export const updateDocumentAnnotation = (
  document: FileDocument,
  value: unknown,
  now?: string,
): FileDocument => {
  const annotation = requireAnnotation(value);
  const index = document.annotations.findIndex(({ id }) => id === annotation.id);
  if (index < 0) {
    throw new AnnotationMutationError(`Annotation does not exist: ${annotation.id}`);
  }
  const annotations = [...document.annotations];
  annotations[index] = {
    ...annotation,
    createdAt: document.annotations[index].createdAt,
    updatedAt: mutationTimestamp(now),
  } as Annotation;
  return {
    ...document,
    annotations,
    updatedAt: mutationTimestamp(now),
  };
};

export const deleteDocumentAnnotation = (
  document: FileDocument,
  annotationId: AnnotationId,
  now?: string,
): FileDocument => {
  const annotations = document.annotations.filter(({ id }) => id !== annotationId);
  if (annotations.length === document.annotations.length) return document;
  return {
    ...document,
    annotations,
    updatedAt: mutationTimestamp(now),
  };
};
