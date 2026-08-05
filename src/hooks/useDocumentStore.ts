import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation, AnnotationId, FileDocument, ScoreAnchor } from '../types/document';
import type { MusicSample } from '../types/music';
import { PRESET_SAMPLES } from '../data/samples';
import { extractMusicXml, parseMusicXmlToAbc } from '../utils/xmlParser';
import {
  createDocumentFromAbc,
  sampleToDocument,
  updateDocumentAbc,
} from '../utils/fileSession';

import { storageAdapter } from '../utils/storageAdapter';
import {
  appendDocumentAnnotations,
  deleteDocumentAnnotation,
  updateDocumentAnnotation,
} from '../music/annotationMutations';

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

  const handleAbcChange = useCallback((newAbc: string) => {
    if (!activeFileId) return;
    setDocuments((docs) =>
      docs.map((doc) => (doc.id === activeFileId ? updateDocumentAbc(doc, newAbc, 'manual-edit') : doc))
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
    if (!activeFileId) return;
    setDocuments((current) => current.map((document) => (
      document.id === activeFileId
        ? appendDocumentAnnotations(document, annotations)
        : document
    )));
  }, [activeFileId]);

  const handleAddAnnotation = useCallback((annotation: Annotation) => {
    handleAddAnnotations([annotation]);
  }, [handleAddAnnotations]);

  const handleUpdateAnnotation = useCallback((annotation: Annotation) => {
    if (!activeFileId) return;
    setDocuments((current) => current.map((document) => (
      document.id === activeFileId
        ? updateDocumentAnnotation(document, annotation)
        : document
    )));
  }, [activeFileId]);

  const handleDeleteAnnotation = useCallback((annotationId: AnnotationId) => {
    if (!activeFileId) return;
    setDocuments((current) => current.map((document) => (
      document.id === activeFileId
        ? deleteDocumentAnnotation(document, annotationId)
        : document
    )));
  }, [activeFileId]);

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
    handleSelectFile,
    handleAbcChange,
    handleProcessMusicXml,
    handleDeleteDocument,
    handleReorderDocument,
    handleAddAnnotation,
    handleAddAnnotations,
    handleUpdateAnnotation,
    handleDeleteAnnotation,
  };
};
