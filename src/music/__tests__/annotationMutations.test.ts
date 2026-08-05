import { describe, expect, it } from 'vitest';
import type { Annotation, FileDocument } from '../../types/document';
import {
  AnnotationMutationError,
  appendDocumentAnnotations,
  deleteDocumentAnnotation,
  updateDocumentAnnotation,
} from '../annotationMutations';

const timestamp = '2026-08-05T00:00:00.000Z';
const document: FileDocument = {
  id: 'document-1',
  name: 'Score.abc',
  sourceType: 'abc',
  abcSource: 'X:1\nK:C\nCDEF|',
  revision: 7,
  scoreInfo: { title: 'Score' },
  annotations: [],
  chats: [],
  versions: [{
    revision: 7,
    abcSource: 'X:1\nK:C\nCDEF|',
    createdAt: timestamp,
    reason: 'manual-edit',
  }],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const annotation = (id: string, body = 'A useful explanation.'): Annotation => ({
  id,
  kind: 'explanation',
  span: { startMeasure: 1, endMeasure: 1 },
  label: 'Opening',
  body,
  source: 'user',
  createdAt: timestamp,
  updatedAt: timestamp,
});

describe('annotation document mutations', () => {
  it('appends a validated batch atomically without changing ABC revision or history', () => {
    const next = appendDocumentAnnotations(
      document,
      [annotation('annotation-1'), annotation('annotation-2')],
      '2026-08-05T01:00:00.000Z',
    );

    expect(next.annotations.map(({ id }) => id)).toEqual(['annotation-1', 'annotation-2']);
    expect(next.revision).toBe(document.revision);
    expect(next.versions).toBe(document.versions);
    expect(next.abcSource).toBe(document.abcSource);
    expect(document.annotations).toEqual([]);
  });

  it('applies none when any annotation in a batch is invalid or duplicates an ID', () => {
    const invalid = { ...annotation('invalid'), span: { startMeasure: 0, endMeasure: 1 } };
    expect(() => appendDocumentAnnotations(document, [annotation('valid'), invalid]))
      .toThrow(AnnotationMutationError);
    expect(() => appendDocumentAnnotations(document, [annotation('same'), annotation('same')]))
      .toThrow('Annotation ID already exists: same');
    expect(document.annotations).toEqual([]);
  });

  it('updates canonical content while preserving identity creation time and score history', () => {
    const existing = appendDocumentAnnotations(document, [annotation('annotation-1')], timestamp);
    const next = updateDocumentAnnotation(
      existing,
      { ...annotation('annotation-1', 'Updated body.'), createdAt: 'model-controlled' },
      '2026-08-05T02:00:00.000Z',
    );

    expect(next.annotations[0]).toMatchObject({
      id: 'annotation-1',
      body: 'Updated body.',
      createdAt: timestamp,
      updatedAt: '2026-08-05T02:00:00.000Z',
    });
    expect(next.revision).toBe(7);
    expect(next.versions).toBe(document.versions);
  });

  it('deletes explicitly and treats repeated deletion as a no-op', () => {
    const existing = appendDocumentAnnotations(document, [annotation('annotation-1')], timestamp);
    const next = deleteDocumentAnnotation(existing, 'annotation-1', '2026-08-05T03:00:00.000Z');

    expect(next.annotations).toEqual([]);
    expect(next.revision).toBe(7);
    expect(next.versions).toBe(document.versions);
    expect(deleteDocumentAnnotation(next, 'annotation-1')).toBe(next);
  });
});
