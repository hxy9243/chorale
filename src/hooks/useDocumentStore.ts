import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Annotation,
  AnnotationId,
  EditHistoryEntry,
  FileDocument,
  ScoreAnchor,
  ScoreInfo,
  ScoreVersion,
} from '../types/document';
import type { MusicSample } from '../types/music';
import { PRESET_SAMPLES } from '../data/samples';
import { extractMusicXml, parseMusicXmlToAbc } from '../utils/xmlParser';
import {
  createDocumentFromAbc,
  duplicateDocument,
  limitScoreVersions,
  parseAbcMetadata,
  sampleToDocument,
  updateDocumentAbc,
} from '../utils/fileSession';
import {
  createAnnotationHistoryEntry,
  createBatchAnnotationsHistoryEntry,
  createBodyHistoryEntry,
  createMetadataHistoryEntry,
  limitHistoryEntries,
  MAX_HISTORY_ENTRIES,
  synthesizeInitialHistory,
} from '../utils/fileHistory';
import { parseAbcHeaderMetadata, updateAbcHeaderMetadata, type ScoreMetadata } from '../utils/abcMetadata';

import { storageAdapter } from '../utils/storageAdapter';
import {
  appendDocumentAnnotations,
  deleteDocumentAnnotation,
  updateDocumentAnnotation,
} from '../music/annotationMutations';
import {
  applyMeasureMutation,
  applyWholeScoreReplacement,
  rebaseAnnotationsForMutation,
  retainAnnotationsForWholeScoreReplacement,
  type MeasureMutation,
  type MeasureMutationResult,
} from '../music/scoreDrafting';
import { extractScore } from '../music/scoreSnapshot';

const ACTIVE_FILE_KEY = 'chorale.workspace.activeFileId';
const AUTOSAVE_DELAY_MS = 400;

export type HydrationStatus = 'hydrating' | 'ready' | 'error';
export type SaveStatus = 'saved' | 'saving' | 'error';

const readStoredActiveFileId = (): string => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ACTIVE_FILE_KEY) || '';
};

export const useDocumentStore = () => {
  const [documents, setDocuments] = useState<FileDocument[]>([]);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('hydrating');
  const [activeFileId, setActiveFileId] = useState<string>(() => readStoredActiveFileId());
  const [activeAnchor, setActiveAnchor] = useState<ScoreAnchor | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequestRef = useRef(0);
  const workspaceInitializedRef = useRef(false);

  const activeDocument = documents.find((doc) => doc.id === activeFileId);
  const activeFileName = activeDocument?.name || '';
  const abcCode = activeDocument?.abcSource || '';
  const abcRevision = activeDocument?.revision || 0;

  const editingHistory = useMemo((): EditHistoryEntry[] => {
    if (!activeDocument) return [];
    return synthesizeInitialHistory(activeDocument);
  }, [activeDocument]);

  const activeHistoryIndex = useMemo(() => {
    if (!activeDocument || editingHistory.length === 0) return 0;
    if (
      activeDocument.historyIndex !== undefined &&
      activeDocument.historyIndex >= 0 &&
      activeDocument.historyIndex < editingHistory.length
    ) {
      return activeDocument.historyIndex;
    }
    return editingHistory.length - 1;
  }, [activeDocument, editingHistory]);

  const canUndo = activeHistoryIndex > 0;
  const canRedo = activeHistoryIndex < editingHistory.length - 1;

  // Hydrate documents from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const docs = await storageAdapter.getDocuments();
        if (!cancelled) {
          setDocuments(docs);
          setHydrationStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setHydrationStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to hydrate documents.');
        }
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-save effect: ONLY run after hydration is ready
  useEffect(() => {
    if (hydrationStatus !== 'ready') return;

    if (documents.length === 0) {
      void storageAdapter.saveDocuments([]);
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    const timeout = window.setTimeout(() => {
      void storageAdapter.saveDocuments(documents)
        .then(() => setSaveStatus('saved'))
        .catch((caught) => {
          console.error('Failed to auto-save documents:', caught);
          setSaveStatus('error');
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [documents, hydrationStatus]);

  useEffect(() => {
    if (activeFileId) {
      window.localStorage.setItem(ACTIVE_FILE_KEY, activeFileId);
    } else {
      window.localStorage.removeItem(ACTIVE_FILE_KEY);
    }
  }, [activeFileId]);

  const handleSelectFile = useCallback((fileId: string) => {
    if (fileId !== activeFileId) {
      setActiveFileId(fileId);
      setActiveAnchor(null);
      setError(null);
    }
  }, [activeFileId]);

  const handleAbcChange = useCallback((newAbc: string, scoreInfoOverrides?: Partial<ScoreInfo>) => {
    if (!activeFileId) return;
    setActiveAnchor(null);
    const hasScoreInfoOverrides = scoreInfoOverrides !== undefined && Object.keys(scoreInfoOverrides).length > 0;
    setDocuments((docs) =>
      docs.map((doc) => {
        if (doc.id !== activeFileId) return doc;
        if (doc.abcSource === newAbc) {
          if (!hasScoreInfoOverrides) return doc;
          return {
            ...doc,
            scoreInfo: { ...doc.scoreInfo, ...scoreInfoOverrides },
            updatedAt: new Date().toISOString(),
          };
        }

        const currentHistory = synthesizeInitialHistory(doc);
        const currentIndex = doc.historyIndex !== undefined && doc.historyIndex >= 0 && doc.historyIndex < currentHistory.length
          ? doc.historyIndex
          : currentHistory.length - 1;
        const trimmedHistory = currentHistory.slice(0, currentIndex + 1);
        const newHistoryEntry = createBodyHistoryEntry(doc, newAbc);
        const nextHistory = limitHistoryEntries([...trimmedHistory, newHistoryEntry], MAX_HISTORY_ENTRIES);

        const now = new Date().toISOString();
        const nextRevision = doc.revision + 1;
        const newVersion: ScoreVersion = {
          revision: nextRevision,
          abcSource: newAbc,
          createdAt: now,
          reason: 'manual-edit',
        };

        const parsedMeta = parseAbcMetadata(newAbc);

        return {
          ...doc,
          abcSource: newAbc,
          revision: nextRevision,
          scoreInfo: {
            ...doc.scoreInfo,
            title: parsedMeta.title || doc.scoreInfo.title,
            subtitle: parsedMeta.subtitle,
            composer: parsedMeta.composer || doc.scoreInfo.composer,
            key: parsedMeta.key || doc.scoreInfo.key,
            meter: parsedMeta.meter || doc.scoreInfo.meter,
            tempoText: parsedMeta.tempoText || doc.scoreInfo.tempoText,
            ...scoreInfoOverrides,
          },
          versions: limitScoreVersions([...doc.versions, newVersion]),
          history: nextHistory,
          historyIndex: nextHistory.length - 1,
          updatedAt: now,
        };
      })
    );
  }, [activeFileId]);

  const handleUpdateMetadata = useCallback((updates: Partial<ScoreMetadata>) => {
    if (!activeFileId) return;
    setDocuments((docs) =>
      docs.map((doc) => {
        if (doc.id !== activeFileId) return doc;
        const newAbc = updateAbcHeaderMetadata(doc.abcSource, updates);
        if (newAbc === doc.abcSource) return doc;

        const currentHistory = synthesizeInitialHistory(doc);
        const currentIndex = doc.historyIndex !== undefined && doc.historyIndex >= 0 && doc.historyIndex < currentHistory.length
          ? doc.historyIndex
          : currentHistory.length - 1;
        const trimmedHistory = currentHistory.slice(0, currentIndex + 1);
        const newHistoryEntry = createMetadataHistoryEntry(doc, newAbc, updates);
        const nextHistory = limitHistoryEntries([...trimmedHistory, newHistoryEntry], MAX_HISTORY_ENTRIES);

        const now = new Date().toISOString();
        const nextRevision = doc.revision + 1;
        const newVersion: ScoreVersion = {
          revision: nextRevision,
          abcSource: newAbc,
          createdAt: now,
          reason: 'manual-edit',
        };

        const parsedMeta = parseAbcHeaderMetadata(newAbc);

        return {
          ...doc,
          abcSource: newAbc,
          revision: nextRevision,
          scoreInfo: {
            ...doc.scoreInfo,
            title: parsedMeta.title || doc.scoreInfo.title,
            subtitle: parsedMeta.subtitle,
            composer: parsedMeta.composer || doc.scoreInfo.composer,
            key: parsedMeta.key || doc.scoreInfo.key,
            meter: parsedMeta.meter || doc.scoreInfo.meter,
            tempoText: parsedMeta.tempoText || doc.scoreInfo.tempoText,
          },
          versions: limitScoreVersions([...doc.versions, newVersion]),
          history: nextHistory,
          historyIndex: nextHistory.length - 1,
          updatedAt: now,
        };
      })
    );
  }, [activeFileId]);

  const handleProcessMusicXml = useCallback(async (fileData: ArrayBuffer | string, fileName: string) => {
    const requestId = ++loadRequestRef.current;
    try {
      setLoading(true);
      setError(null);

      let abc = '';
      if (typeof fileData === 'string' && (fileName.endsWith('.abc') || fileData.startsWith('X:'))) {
        abc = fileData;
      } else {
        const xmlText = await extractMusicXml(fileData);
        abc = parseMusicXmlToAbc(xmlText);
      }

      if (requestId !== loadRequestRef.current) return;

      const sourceType = fileName.endsWith('.mxl') ? 'mxl' : fileName.endsWith('.abc') ? 'abc' : 'musicxml';
      const newDoc = createDocumentFromAbc(fileName, sourceType, abc);

      setDocuments((prevDocs) => [...prevDocs.filter((doc) => doc.name !== fileName), newDoc]);
      setActiveFileId(newDoc.id);
      setActiveAnchor(null);
    } catch (caught) {
      if (requestId !== loadRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Failed to parse file.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleCreateDocument = useCallback((abcSource: string, title: string) => {
    const safeFileName = `${title.trim() || 'Untitled score'}.abc`;
    const newDocument = createDocumentFromAbc(safeFileName, 'abc', abcSource, title);
    setDocuments((current) => [...current, newDocument]);
    setActiveFileId(newDocument.id);
    setActiveAnchor(null);
    setError(null);
  }, []);

  const handleMeasureMutation = useCallback((
    mutation: MeasureMutation,
    reason: ScoreVersion['reason'] = 'manual-edit',
  ): MeasureMutationResult => {
    if (!activeDocument) return { status: 'invalid', errors: ['Open a score before editing measures.'] };
    const result = applyMeasureMutation(activeDocument.abcSource, mutation);
    if (result.status !== 'valid') return result;
    const annotations = rebaseAnnotationsForMutation(activeDocument.annotations, mutation);
    const documentWithRebasedAnnotations = {
      ...activeDocument,
      annotations,
      // Seed history from the pre-mutation document before the new body entry
      // captures rebased annotations, so Undo restores both score and overlays.
      history: synthesizeInitialHistory(activeDocument),
    };
    const updatedDocument = updateDocumentAbc(
      documentWithRebasedAnnotations,
      result.abcSource,
      reason,
      { measures: (() => {
        try { return extractScore(result.abcSource).measures.length; } catch { return activeDocument.scoreInfo.measures; }
      })() },
    );
    setDocuments((current) => current.map((document) => (
      document.id === activeDocument.id ? updatedDocument : document
    )));
    setActiveAnchor(result.affectedSpan);
    setError(null);
    return result;
  }, [activeDocument]);

  const handleWholeScoreReplacement = useCallback((
    replacementAbc: string,
    reason: ScoreVersion['reason'] = 'tool-apply',
  ): MeasureMutationResult => {
    if (!activeDocument) return { status: 'invalid', errors: ['Open a score before editing it.'] };
    const result = applyWholeScoreReplacement(activeDocument.abcSource, replacementAbc);
    if (result.status !== 'valid') return result;
    const retainedAnnotations = retainAnnotationsForWholeScoreReplacement(
      activeDocument.annotations,
      activeDocument.abcSource,
      result.abcSource,
    );
    const documentWithRetainedAnnotations = {
      ...activeDocument,
      annotations: retainedAnnotations,
      history: synthesizeInitialHistory(activeDocument),
    };
    const updatedDocument = updateDocumentAbc(
      documentWithRetainedAnnotations,
      result.abcSource,
      reason,
      { measures: result.affectedSpan.endMeasure },
    );
    setDocuments((current) => current.map((document) => (
      document.id === activeDocument.id ? updatedDocument : document
    )));
    setActiveAnchor(result.affectedSpan);
    setError(null);
    return result;
  }, [activeDocument]);

  const loadSample = useCallback(async (sample: MusicSample) => {
    const sampleName = `${sample.title} (${sample.type.toUpperCase()})`;
    const existingDoc = documents.find((doc) => doc.name === sampleName);
    if (existingDoc) {
      setActiveFileId(existingDoc.id);
      setActiveAnchor(null);
      return;
    }

    const requestId = ++loadRequestRef.current;
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(sample.filename);
      if (!response.ok) {
        throw new Error(`Failed to fetch sample file: ${response.statusText}`);
      }

      let abc = '';
      if (sample.type === 'mxl') {
        const buffer = await response.arrayBuffer();
        const xmlText = await extractMusicXml(buffer);
        abc = parseMusicXmlToAbc(xmlText);
      } else {
        const text = await response.text();
        abc = parseMusicXmlToAbc(text);
      }

      if (requestId !== loadRequestRef.current) return;

      const newDoc = sampleToDocument(sample, abc);
      setDocuments((prevDocs) => [...prevDocs, newDoc]);
      setActiveFileId(newDoc.id);
      setActiveAnchor(null);
    } catch (caught) {
      if (requestId !== loadRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Failed to load sample track.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [documents]);

  // Initial setup: ONLY run after hydration has finished
  useEffect(() => {
    if (hydrationStatus !== 'ready') return;
    if (workspaceInitializedRef.current) return;
    workspaceInitializedRef.current = true;

    if (documents.length === 0 && PRESET_SAMPLES.length > 0) {
      void loadSample(PRESET_SAMPLES[0]);
    } else if (!activeFileId && documents.length > 0) {
      setActiveFileId(documents[0].id);
    }
  }, [hydrationStatus, activeFileId, documents, loadSample]);

  const handleDeleteDocument = useCallback((fileId: string) => {
    setDocuments((prevDocs) => {
      const nextDocs = prevDocs.filter((doc) => doc.id !== fileId);
      if (activeFileId === fileId) {
        const remaining = nextDocs[0]?.id || '';
        setActiveFileId(remaining);
        setActiveAnchor(null);
      }
      return nextDocs;
    });
  }, [activeFileId]);

  const handleDuplicateDocument = useCallback((fileId: string) => {
    setDocuments((prevDocs) => {
      const sourceIndex = prevDocs.findIndex((doc) => doc.id === fileId);
      if (sourceIndex === -1) return prevDocs;
      const copy = duplicateDocument(prevDocs[sourceIndex]);
      const nextDocs = [...prevDocs];
      nextDocs.splice(sourceIndex + 1, 0, copy);
      return nextDocs;
    });
  }, []);

  const handleReorderDocument = useCallback((
    sourceFileId: string,
    targetFileId: string,
    placement: 'before' | 'after',
  ) => {
    setDocuments((prevDocs) => {
      const sourceIndex = prevDocs.findIndex((doc) => doc.id === sourceFileId);
      const targetIndex = prevDocs.findIndex((doc) => doc.id === targetFileId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return prevDocs;
      }

      const nextDocs = [...prevDocs];
      const [moved] = nextDocs.splice(sourceIndex, 1);
      const adjustedTargetIndex = nextDocs.findIndex((doc) => doc.id === targetFileId);
      const insertionIndex = placement === 'after'
        ? adjustedTargetIndex + 1
        : adjustedTargetIndex;
      nextDocs.splice(insertionIndex, 0, moved);
      return nextDocs;
    });
  }, []);

  const handleAddAnnotations = useCallback((annotations: readonly Annotation[]) => {
    if (!activeFileId || annotations.length === 0) return;
    setDocuments((current) => current.map((document) => {
      if (document.id !== activeFileId) return document;

      const docWithNewAnnotations = appendDocumentAnnotations(document, annotations);
      const currentHistory = synthesizeInitialHistory(document);
      const currentIndex = document.historyIndex !== undefined && document.historyIndex >= 0 && document.historyIndex < currentHistory.length
        ? document.historyIndex
        : currentHistory.length - 1;
      const trimmedHistory = currentHistory.slice(0, currentIndex + 1);

      const newHistoryEntry = annotations.length === 1
        ? createAnnotationHistoryEntry(document, 'add', annotations[0], docWithNewAnnotations.annotations)
        : createBatchAnnotationsHistoryEntry(document, 'add', annotations, docWithNewAnnotations.annotations);

      const nextHistory = limitHistoryEntries([...trimmedHistory, newHistoryEntry], MAX_HISTORY_ENTRIES);

      return {
        ...docWithNewAnnotations,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        updatedAt: newHistoryEntry.timestamp,
      };
    }));
  }, [activeFileId]);

  const handleAddAnnotation = useCallback((annotation: Annotation) => {
    handleAddAnnotations([annotation]);
  }, [handleAddAnnotations]);

  const handleUpdateAnnotation = useCallback((annotation: Annotation) => {
    if (!activeFileId) return;
    setDocuments((current) => current.map((document) => {
      if (document.id !== activeFileId) return document;

      const docWithUpdatedAnnotations = updateDocumentAnnotation(document, annotation);
      const currentHistory = synthesizeInitialHistory(document);
      const currentIndex = document.historyIndex !== undefined && document.historyIndex >= 0 && document.historyIndex < currentHistory.length
        ? document.historyIndex
        : currentHistory.length - 1;
      const trimmedHistory = currentHistory.slice(0, currentIndex + 1);

      const newHistoryEntry = createAnnotationHistoryEntry(
        document,
        'edit',
        annotation,
        docWithUpdatedAnnotations.annotations
      );
      const nextHistory = limitHistoryEntries([...trimmedHistory, newHistoryEntry], MAX_HISTORY_ENTRIES);

      return {
        ...docWithUpdatedAnnotations,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        updatedAt: newHistoryEntry.timestamp,
      };
    }));
  }, [activeFileId]);

  const handleDeleteAnnotation = useCallback((annotationId: AnnotationId) => {
    if (!activeFileId) return;
    setDocuments((current) => current.map((document) => {
      if (document.id !== activeFileId) return document;

      const deletedAnnotation = document.annotations.find((a) => a.id === annotationId);
      const docWithDeletedAnnotations = deleteDocumentAnnotation(document, annotationId);
      const currentHistory = synthesizeInitialHistory(document);
      const currentIndex = document.historyIndex !== undefined && document.historyIndex >= 0 && document.historyIndex < currentHistory.length
        ? document.historyIndex
        : currentHistory.length - 1;
      const trimmedHistory = currentHistory.slice(0, currentIndex + 1);

      const newHistoryEntry = deletedAnnotation
        ? createAnnotationHistoryEntry(
            document,
            'delete',
            deletedAnnotation,
            docWithDeletedAnnotations.annotations
          )
        : createBodyHistoryEntry(document, document.abcSource, 'Deleted annotation');

      const nextHistory = limitHistoryEntries([...trimmedHistory, newHistoryEntry], MAX_HISTORY_ENTRIES);

      return {
        ...docWithDeletedAnnotations,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        updatedAt: newHistoryEntry.timestamp,
      };
    }));
  }, [activeFileId]);

  const handleRevertTo = useCallback((target: string | number) => {
    if (!activeFileId || editingHistory.length === 0) return;

    let targetIndex = -1;
    if (typeof target === 'number') {
      targetIndex = target;
    } else {
      targetIndex = editingHistory.findIndex((entry) => entry.id === target);
    }

    if (targetIndex < 0 || targetIndex >= editingHistory.length) return;
    const targetEntry = editingHistory[targetIndex];

    setDocuments((docs) =>
      docs.map((doc) => {
        if (doc.id !== activeFileId) return doc;
        return {
          ...doc,
          abcSource: targetEntry.abcSource,
          revision: targetEntry.revision,
          scoreInfo: { ...targetEntry.scoreInfo },
          annotations: [...targetEntry.annotations],
          historyIndex: targetIndex,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, [activeFileId, editingHistory]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    handleRevertTo(activeHistoryIndex - 1);
  }, [canUndo, activeHistoryIndex, handleRevertTo]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    handleRevertTo(activeHistoryIndex + 1);
  }, [canRedo, activeHistoryIndex, handleRevertTo]);

  return {
    documents,
    hydrationStatus,
    activeFileId,
    activeDocument,
    activeFileName,
    abcCode,
    abcRevision,
    activeAnchor,
    setActiveAnchor,
    saveStatus,
    loading,
    error,
    editingHistory,
    activeHistoryIndex,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    handleRevertTo,
    handleSelectFile,
    handleAbcChange,
    handleUpdateMetadata,
    handleCreateDocument,
    handleMeasureMutation,
    handleWholeScoreReplacement,
    handleProcessMusicXml,
    handleDeleteDocument,
    handleDuplicateDocument,
    handleReorderDocument,
    handleAddAnnotation,
    handleAddAnnotations,
    handleUpdateAnnotation,
    handleDeleteAnnotation,
  };
};
