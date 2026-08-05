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
});
