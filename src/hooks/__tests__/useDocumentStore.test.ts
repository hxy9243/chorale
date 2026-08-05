import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from '../useDocumentStore';
import { storageAdapter } from '../../utils/storageAdapter';
import type { FileDocument } from '../../types/document';
import * as xmlParser from '../../utils/xmlParser';

describe('useDocumentStore', () => {
  beforeEach(() => {
    localStorage.clear();
    storageAdapter.clearMemoryStore();
    vi.clearAllMocks();

    vi.spyOn(xmlParser, 'extractMusicXml').mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`);
  });

  const sampleDoc: FileDocument = {
    id: 'idb-doc-1',
    name: 'IDBScore.abc',
    sourceType: 'abc',
    abcSource: 'X:1\nT:IDB Score\nK:C\nCDEF|',
    revision: 1,
    annotations: [],
    chats: [],
    versions: [],
    scoreInfo: { title: 'IDB Score' },
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };

  it('hydrates documents from IndexedDB storageAdapter and sets hydrationStatus to ready', async () => {
    vi.spyOn(storageAdapter, 'getDocuments').mockResolvedValue([sampleDoc]);

    const { result } = renderHook(() => useDocumentStore());

    await waitFor(() => {
      expect(result.current.hydrationStatus).toBe('ready');
    });

    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0].name).toBe('IDBScore.abc');
  });

  it('clears the active range only when switching to another file', async () => {
    const secondDoc: FileDocument = {
      ...sampleDoc,
      id: 'idb-doc-2',
      name: 'Second.abc',
    };
    localStorage.setItem('chorale.workspace.activeFileId', sampleDoc.id);
    vi.spyOn(storageAdapter, 'getDocuments').mockResolvedValue([sampleDoc, secondDoc]);
    const { result } = renderHook(() => useDocumentStore());
    await waitFor(() => expect(result.current.hydrationStatus).toBe('ready'));

    act(() => result.current.setActiveAnchor({ startMeasure: 2, endMeasure: 4 }));
    expect(result.current.activeAnchor).toEqual({ startMeasure: 2, endMeasure: 4 });

    act(() => result.current.handleSelectFile(secondDoc.id));
    expect(result.current.activeFileId).toBe(secondDoc.id);
    expect(result.current.activeAnchor).toBeNull();
  });

  it('loads sample track safely when no IndexedDB documents exist and hydration completes', async () => {
    vi.spyOn(storageAdapter, 'getDocuments').mockResolvedValue([]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      text: () => Promise.resolve(`<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`),
    } as Response);

    const { result } = renderHook(() => useDocumentStore());

    await waitFor(() => {
      expect(result.current.hydrationStatus).toBe('ready');
    });

    await waitFor(() => {
      expect(result.current.documents.length).toBeGreaterThan(0);
    });
  });

  it('creates, updates, and deletes annotations without changing ABC revision or history', async () => {
    localStorage.setItem('chorale.workspace.activeFileId', sampleDoc.id);
    vi.spyOn(storageAdapter, 'getDocuments').mockResolvedValue([sampleDoc]);
    const { result } = renderHook(() => useDocumentStore());
    await waitFor(() => expect(result.current.hydrationStatus).toBe('ready'));
    const initialRevision = result.current.abcRevision;
    const initialVersions = result.current.activeDocument?.versions;
    const createdAt = '2026-08-05T00:00:00.000Z';

    act(() => result.current.handleAddAnnotation({
      id: 'annotation-hook',
      kind: 'explanation',
      span: { startMeasure: 1, endMeasure: 1 },
      label: 'Opening',
      body: 'Initial body.',
      source: 'user',
      createdAt,
      updatedAt: createdAt,
    }));
    expect(result.current.activeDocument?.annotations).toHaveLength(1);

    act(() => result.current.handleUpdateAnnotation({
      ...result.current.activeDocument!.annotations[0],
      body: 'Edited body.',
    }));
    expect(result.current.activeDocument?.annotations[0].body).toBe('Edited body.');

    act(() => result.current.handleDeleteAnnotation('annotation-hook'));
    expect(result.current.activeDocument?.annotations).toEqual([]);
    expect(result.current.abcRevision).toBe(initialRevision);
    expect(result.current.activeDocument?.versions).toBe(initialVersions);
  });

  it('rehydrates accepted and manual annotations after an autosaved reload', async () => {
    vi.restoreAllMocks();
    localStorage.setItem('chorale.workspace.activeFileId', sampleDoc.id);
    await storageAdapter.saveDocuments([sampleDoc]);
    const first = renderHook(() => useDocumentStore());
    await waitFor(() => expect(first.result.current.hydrationStatus).toBe('ready'));

    act(() => first.result.current.handleAddAnnotations([
      {
        id: 'annotation-manual-persisted',
        kind: 'explanation',
        span: { startMeasure: 1, endMeasure: 1 },
        label: 'Manual note',
        body: 'Created directly by the user.',
        source: 'user',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
      {
        id: 'annotation-accepted-persisted',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 1, denominator: 4 } },
        chordSymbol: 'G7',
        label: 'Accepted dominant',
        body: 'Accepted from an assistant proposal.',
        source: 'assistant',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    ]));
    await waitFor(() => expect(first.result.current.saveStatus).toBe('saved'), { timeout: 2_000 });
    expect((await storageAdapter.getDocuments())[0].annotations).toHaveLength(2);
    first.unmount();

    const reloaded = renderHook(() => useDocumentStore());
    await waitFor(() => expect(reloaded.result.current.hydrationStatus).toBe('ready'));
    expect(reloaded.result.current.activeDocument?.annotations.map(({ id }) => id)).toEqual([
      'annotation-manual-persisted',
      'annotation-accepted-persisted',
    ]);
    expect(reloaded.result.current.abcRevision).toBe(sampleDoc.revision);
    expect(reloaded.result.current.activeDocument?.versions).toEqual(sampleDoc.versions);
  });
});
