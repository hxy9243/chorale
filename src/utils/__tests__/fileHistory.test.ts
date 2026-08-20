import { describe, expect, it } from 'vitest';
import {
  createAnnotationHistoryEntry,
  createBodyHistoryEntry,
  createMetadataHistoryEntry,
  createOriginHistoryEntry,
  limitHistoryEntries,
  synthesizeInitialHistory,
} from '../fileHistory';
import type { ChordAnnotation, FileDocument, RangeAnnotation } from '../../types/document';

describe('fileHistory Utilities', () => {
  const mockDoc: FileDocument = {
    id: 'doc-1',
    name: 'test-score.xml',
    sourceType: 'musicxml',
    abcSource: 'X:1\nT:Minuet\nK:C\nM:4/4\nCDEF|',
    revision: 1,
    scoreInfo: {
      title: 'Minuet',
      composer: 'Bach',
      key: 'C',
      meter: '4/4',
    },
    annotations: [],
    chats: [],
    versions: [],
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T00:00:00Z',
  };

  it('creates an origin history entry', () => {
    const origin = createOriginHistoryEntry(mockDoc);
    expect(origin.category).toBe('origin');
    expect(origin.actionType).toBe('initial');
    expect(origin.revision).toBe(1);
    expect(origin.summary).toContain('Minuet');
    expect(origin.abcSource).toBe(mockDoc.abcSource);
    expect(origin.scoreInfo.title).toBe('Minuet');
  });

  it('creates metadata history entries with descriptive field changes', () => {
    const updatedAbc = 'X:1\nT:Minuet in G\nK:G\nM:4/4\nCDEF|';
    const entry = createMetadataHistoryEntry(mockDoc, updatedAbc, {
      key: 'G',
    });

    expect(entry.category).toBe('metadata');
    expect(entry.actionType).toBe('edit');
    expect(entry.metadataField).toBe('key');
    expect(entry.summary).toBe('Key signature → G');
    expect(entry.scoreInfo.key).toBe('G');
    expect(entry.revision).toBe(2);
  });

  it('creates body history entries for notation edits', () => {
    const nextAbc = 'X:1\nT:Minuet\nK:C\nM:4/4\nCDEF|GABc|';
    const entry = createBodyHistoryEntry(mockDoc, nextAbc);

    expect(entry.category).toBe('body');
    expect(entry.actionType).toBe('edit');
    expect(entry.summary).toContain('ABC music body');
    expect(entry.abcSource).toBe(nextAbc);
  });

  it('creates annotation history entries for add, edit, and delete', () => {
    const chord: ChordAnnotation = {
      id: 'ann-1',
      kind: 'chord',
      span: { startMeasure: 2, endMeasure: 2 },
      position: { measure: 2, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'G7',
      label: 'Dominant 7th',
      body: 'Dominant harmony',
      source: 'user',
      createdAt: '2026-08-20T00:00:00Z',
      updatedAt: '2026-08-20T00:00:00Z',
    };

    const addEntry = createAnnotationHistoryEntry(mockDoc, 'add', chord, [chord]);
    expect(addEntry.category).toBe('annotation');
    expect(addEntry.actionType).toBe('add');
    expect(addEntry.annotationKind).toBe('chord');
    expect(addEntry.summary).toContain('Add Chord [G7] at M2');
    expect(addEntry.annotations).toHaveLength(1);

    const modulation: RangeAnnotation = {
      id: 'ann-2',
      kind: 'modulation',
      span: { startMeasure: 4, endMeasure: 8 },
      label: 'Modulation to D',
      body: 'Key change',
      source: 'user',
      createdAt: '2026-08-20T00:00:00Z',
      updatedAt: '2026-08-20T00:00:00Z',
    };

    const delEntry = createAnnotationHistoryEntry(mockDoc, 'delete', modulation, []);
    expect(delEntry.category).toBe('annotation');
    expect(delEntry.actionType).toBe('delete');
    expect(delEntry.annotationKind).toBe('modulation');
    expect(delEntry.summary).toContain('Delete modulation at M4–M8');
  });

  it('limits history entries while keeping the origin intact', () => {
    const origin = createOriginHistoryEntry(mockDoc);
    const entries = [origin];
    for (let i = 2; i <= 120; i++) {
      entries.push({
        ...origin,
        id: `hist-${i}`,
        revision: i,
        summary: `Edit #${i}`,
      });
    }

    const limited = limitHistoryEntries(entries, 100);
    expect(limited).toHaveLength(100);
    expect(limited[0].id).toBe(origin.id);
    expect(limited[limited.length - 1].revision).toBe(120);
  });

  it('synthesizes initial history if missing', () => {
    const synthesized = synthesizeInitialHistory(mockDoc);
    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].category).toBe('origin');
  });
});
