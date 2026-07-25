import { describe, it, expect } from 'vitest';
import { createDocumentFromAbc, updateDocumentAbc, sampleToDocument } from '../fileSession';
import type { MusicSample } from '../../types/music';

describe('fileSession Utilities', () => {
  it('createDocumentFromAbc creates a valid FileDocument with initial version', () => {
    const doc = createDocumentFromAbc('Test Song.xml', 'musicxml', 'X:1\nT:Test Song\nK:C\nCDEFG', 'Test Song');

    expect(doc.id).toMatch(/^doc-/);
    expect(doc.name).toBe('Test Song.xml');
    expect(doc.sourceType).toBe('musicxml');
    expect(doc.abcSource).toContain('CDEFG');
    expect(doc.revision).toBe(1);
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0].reason).toBe('import');
  });

  it('updateDocumentAbc increments revision and appends score version', () => {
    const doc = createDocumentFromAbc('Test.xml', 'musicxml', 'X:1\nK:C\nC', 'Test');
    const updated = updateDocumentAbc(doc, 'X:1\nK:C\nC D E F');

    expect(updated.revision).toBe(2);
    expect(updated.abcSource).toBe('X:1\nK:C\nC D E F');
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1].revision).toBe(2);
    expect(updated.versions[1].reason).toBe('manual-edit');
  });

  it('updateDocumentAbc returns same doc if ABC content is unchanged', () => {
    const doc = createDocumentFromAbc('Test.xml', 'musicxml', 'X:1\nK:C\nC', 'Test');
    const updated = updateDocumentAbc(doc, 'X:1\nK:C\nC');

    expect(updated).toBe(doc);
  });

  it('sampleToDocument converts a MusicSample into a FileDocument', () => {
    const sample: MusicSample = {
      id: 'sample-1',
      title: 'Bach Minuet',
      composer: 'J.S. Bach',
      filename: '/samples/bach.xml',
      type: 'xml',
    };
    const doc = sampleToDocument(sample, 'X:1\nT:Bach Minuet\nK:G');

    expect(doc.name).toBe('Bach Minuet (XML)');
    expect(doc.scoreInfo.title).toBe('Bach Minuet');
    expect(doc.sourceType).toBe('xml');
  });
});
