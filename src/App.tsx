import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Header } from './components/Header';
import { FileRail } from './components/FileRail';
import { ScoreCardHeader } from './components/ScoreCardHeader';
import { SheetMusicView } from './components/SheetMusicView';
import { AudioPlayer } from './components/AudioPlayer';
import { AbcEditor } from './components/AbcEditor';
import { AgentChatPanel } from './components/AgentChatPanel';
import type { MusicSample } from './types/music';
import type { BuildResult, FileDocument, ScoreAnchor } from './types/document';
import { PRESET_SAMPLES } from './data/samples';
import { extractMusicXml, parseMusicXmlToAbc } from './utils/xmlParser';
import {
  createDocumentFromAbc,
  limitScoreVersions,
  parseAbcMetadata,
  sampleToDocument,
  updateDocumentAbc,
} from './utils/fileSession';
import { formatAnchorLabel } from './utils/anchor';

const EDITOR_VISIBLE_KEY = 'chorale.workspace.editorVisible';
const EDITOR_WIDTH_KEY = 'chorale.workspace.editorWidth';
const DOCUMENTS_STORAGE_KEY = 'chorale.workspace.documents';
const ACTIVE_FILE_KEY = 'chorale.workspace.activeFileId';
const DEFAULT_EDITOR_WIDTH = 420;
const MIN_EDITOR_WIDTH = 320;
const MAX_EDITOR_WIDTH = 720;
const AUTOSAVE_DELAY_MS = 400;

type BuildStatus = 'idle' | 'building' | 'valid' | 'invalid';

const clampEditorWidth = (width: number) => Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, width));

const readStoredBool = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
};

const readStoredNumber = (key: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? clampEditorWidth(value) : fallback;
};

const readStoredDocuments = (): FileDocument[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DOCUMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((document) => ({
      ...document,
      versions: limitScoreVersions(Array.isArray(document.versions) ? document.versions : []),
    }));
  } catch {
    return [];
  }
};

const readStoredActiveFileId = (): string => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ACTIVE_FILE_KEY) || '';
};

type SaveStatus = 'saved' | 'saving' | 'error';

const buildValidationMessage = (status: BuildStatus, buildResult: BuildResult | null) => {
  if (status === 'building') return 'Checking ABC syntax and rebuilding derived score output.';
  if (status === 'invalid') return buildResult?.errors[0]?.message || 'ABC could not be rebuilt.';
  if (status === 'valid' && buildResult) {
    return `Rendered ${buildResult.renderedTuneCount} tune${buildResult.renderedTuneCount === 1 ? '' : 's'} with playback ${buildResult.hasPlayback ? 'available' : 'disabled'}.`;
  }
  return null;
};

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<FileDocument[]>(() => readStoredDocuments());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [activeFileId, setActiveFileId] = useState<string>(() => readStoredActiveFileId());
  const [activeAnchor, setActiveAnchor] = useState<ScoreAnchor | null>(null);
  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(100);
  const [editorVisible, setEditorVisible] = useState<boolean>(() => readStoredBool(EDITOR_VISIBLE_KEY, false));
  const [editorWidth, setEditorWidth] = useState<number>(() => readStoredNumber(EDITOR_WIDTH_KEY, DEFAULT_EDITOR_WIDTH));
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const loadRequestRef = useRef(0);
  const buildRequestRef = useRef(0);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeDocument = documents.find((doc) => doc.id === activeFileId);
  const activeFileName = activeDocument?.name || '';
  const abcCode = activeDocument?.abcSource || '';
  const abcRevision = activeDocument?.revision || 0;
  const anchorLabel = formatAnchorLabel(activeAnchor);
  const saveState = !activeDocument
    ? 'No file'
    : saveStatus === 'saving'
      ? 'Saving'
      : saveStatus === 'error'
        ? 'Error'
        : 'Saved';
  const canRenderScore = buildStatus === 'valid';
  const liveMetadata = useMemo(() => parseAbcMetadata(abcCode), [abcCode]);
  const scoreTitle = liveMetadata.title || activeDocument?.scoreInfo.title || activeFileName || 'Untitled score';
  const scoreComposer = liveMetadata.composer || activeDocument?.scoreInfo.composer || 'Unknown composer';
  const scoreKey = liveMetadata.key || activeDocument?.scoreInfo.key || 'C';
  const scoreMeter = liveMetadata.meter || activeDocument?.scoreInfo.meter || '4/4';
  const scoreTempo = liveMetadata.tempoText || activeDocument?.scoreInfo.tempoText || (tunes?.[0]?.getBpm?.() ? `♩ = ${tunes[0].getBpm()}` : '♩ = 120');

  const handleTuneRendered = useCallback((renderedTunes: abcjs.TuneObject[] | null) => {
    setTunes((prev) => {
      if (prev === renderedTunes) return prev;
      if (!prev && !renderedTunes) return null;
      if (prev && renderedTunes && prev.length === renderedTunes.length && prev[0] === renderedTunes[0]) {
        return prev;
      }
      return renderedTunes;
    });
  }, []);

  const handleSelectAnchor = useCallback((anchor: ScoreAnchor | null) => {
    setActiveAnchor(anchor);
  }, []);

  useEffect(() => {
    if (documents.length === 0 && PRESET_SAMPLES.length > 0) {
      void loadSample(PRESET_SAMPLES[0]);
    } else if (!activeFileId && documents.length > 0) {
      setActiveFileId(documents[0].id);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_VISIBLE_KEY, String(editorVisible));
  }, [editorVisible]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_WIDTH_KEY, String(editorWidth));
  }, [editorWidth]);

  useEffect(() => {
    if (documents.length === 0) {
      window.localStorage.removeItem(DOCUMENTS_STORAGE_KEY);
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
        setSaveStatus('saved');
      } catch (caught) {
        console.error('Failed to auto-save documents:', caught);
        setSaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [documents]);

  useEffect(() => {
    if (activeFileId) {
      window.localStorage.setItem(ACTIVE_FILE_KEY, activeFileId);
    }
  }, [activeFileId]);

  useEffect(() => {
    if (!activeDocument || !abcCode.trim()) {
      setBuildStatus('idle');
      setBuildResult(null);
      setTunes(null);
      return;
    }

    const requestId = ++buildRequestRef.current;
    setBuildStatus('building');
    const timeout = window.setTimeout(() => {
      try {
        const scratch = document.createElement('div');
        const renderedTunes = abcjs.renderAbc(scratch, abcCode, {
          add_classes: false,
          responsive: 'resize',
        });
        if (requestId !== buildRequestRef.current) return;

        const result: BuildResult = {
          fileId: activeDocument.id,
          revision: abcRevision,
          validation: 'valid',
          errors: [],
          renderedTuneCount: renderedTunes?.length || 0,
          hasPlayback: (renderedTunes?.length || 0) > 0,
        };
        setBuildResult(result);
        setBuildStatus('valid');
      } catch (caught) {
        if (requestId !== buildRequestRef.current) return;
        const message = caught instanceof Error ? caught.message : 'ABC validation failed.';
        const result: BuildResult = {
          fileId: activeDocument.id,
          revision: abcRevision,
          validation: 'invalid',
          errors: [{ message }],
          renderedTuneCount: 0,
          hasPlayback: false,
        };
        setBuildResult(result);
        setBuildStatus('invalid');
      }
    }, 140);

    return () => window.clearTimeout(timeout);
  }, [abcCode, abcRevision, activeDocument]);

  const handleSelectFile = (fileId: string) => {
    if (fileId !== activeFileId) {
      setActiveFileId(fileId);
      setActiveAnchor(null);
      setError(null);
    }
  };

  const handleAbcChange = (newAbc: string) => {
    if (!activeFileId) return;
    setDocuments((docs) =>
      docs.map((doc) => (doc.id === activeFileId ? updateDocumentAbc(doc, newAbc, 'manual-edit') : doc))
    );
  };

  const handleProcessMusicXml = async (fileData: ArrayBuffer | string, fileName: string) => {
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
  };

  const loadSample = async (sample: MusicSample) => {
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
  };

  const handleDeleteDocument = (fileId: string) => {
    setDocuments((prevDocs) => {
      const nextDocs = prevDocs.filter((doc) => doc.id !== fileId);
      if (activeFileId === fileId) {
        const remaining = nextDocs[0]?.id || '';
        setActiveFileId(remaining);
        setActiveAnchor(null);
      }
      return nextDocs;
    });
  };

  const handleMoveDocument = (fileId: string, direction: 'up' | 'down') => {
    setDocuments((prevDocs) => {
      const index = prevDocs.findIndex((doc) => doc.id === fileId);
      if (index === -1) return prevDocs;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prevDocs.length) return prevDocs;
      const nextDocs = [...prevDocs];
      const [moved] = nextDocs.splice(index, 1);
      nextDocs.splice(targetIndex, 0, moved);
      return nextDocs;
    });
  };

  const beginEditorResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: editorWidth,
    };
    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const delta = dragState.startX - moveEvent.clientX;
      setEditorWidth(clampEditorWidth(dragState.startWidth + delta));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const [railWidth, setRailWidth] = useState<number>(236);
  const [railCollapsed, setRailCollapsed] = useState<boolean>(false);
  const railDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const beginRailResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    railDragStateRef.current = {
      startX: event.clientX,
      startWidth: railWidth,
    };
    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = railDragStateRef.current;
      if (!dragState) return;
      const delta = moveEvent.clientX - dragState.startX;
      const newWidth = Math.max(160, Math.min(420, dragState.startWidth + delta));
      setRailWidth(newWidth);
    };

    const handlePointerUp = () => {
      railDragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const [chatWidth, setChatWidth] = useState<number>(392);
  const chatDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const beginChatResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    chatDragStateRef.current = {
      startX: event.clientX,
      startWidth: chatWidth,
    };
    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = chatDragStateRef.current;
      if (!dragState) return;
      const delta = dragState.startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(680, dragState.startWidth + delta));
      setChatWidth(newWidth);
    };

    const handlePointerUp = () => {
      chatDragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const workspaceMessage = useMemo(
    () => buildValidationMessage(buildStatus, buildResult),
    [buildResult, buildStatus],
  );

  return (
    <div className="chorale-app-shell">
      <Header
        activeFileName={scoreTitle}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
        railCollapsed={railCollapsed}
        onToggleRail={() => setRailCollapsed((c) => !c)}
        saveState={saveState}
      />

      <div
        className={`workspace-body ${chatOpen ? 'chat-open' : ''} ${railCollapsed ? 'rail-collapsed' : ''}`}
        style={{
          gridTemplateColumns: `${railCollapsed ? 0 : railWidth}px minmax(0, 1fr) ${chatOpen ? `${chatWidth}px` : ''}`,
        }}
      >
        <FileRail
          documents={documents}
          activeFileId={activeFileId}
          onSelectDocument={handleSelectFile}
          onFileLoaded={handleProcessMusicXml}
          onDeleteDocument={handleDeleteDocument}
          onMoveDocument={handleMoveDocument}
          loading={loading}
          error={error}
          collapsed={railCollapsed}
          onBeginResize={beginRailResize}
        />

        <main className="central-workspace">
          <div className={`score-editor-shell ${editorVisible ? 'editor-open' : 'editor-hidden'}`}>
            <section className="score-workspace-card">
              <ScoreCardHeader
                title={scoreTitle}
                zoom={zoom}
                onZoomIn={() => setZoom((z) => Math.min(z + 10, 200))}
                onZoomOut={() => setZoom((z) => Math.max(z - 10, 50))}
                onResetZoom={() => setZoom(100)}
                anchorContext={anchorLabel}
                buildStatus={buildStatus}
                saveState={saveState}
                editorVisible={editorVisible}
                onToggleEditor={() => setEditorVisible((visible) => !visible)}
              />

              <div className="score-canvas">
                <div className="score-sheet">
                  <div className="score-sheet-heading">
                    <div>
                      <h1>{scoreTitle}</h1>
                      <p>{scoreComposer}</p>
                    </div>
                    <span>{scoreKey} · {scoreMeter} · {scoreTempo}</span>
                  </div>

                  {buildStatus === 'invalid' && (
                    <div className="workspace-status-row invalid" role="alert">
                      <span className="workspace-status-indicator invalid">Invalid ABC</span>
                      <span>{workspaceMessage}</span>
                    </div>
                  )}

                  <div className="score-view-wrapper">
                    <SheetMusicView
                      abcCode={canRenderScore ? abcCode : ''}
                      activeAnchor={activeAnchor}
                      onSelectAnchor={handleSelectAnchor}
                      onTuneRendered={handleTuneRendered}
                      zoom={zoom}
                      onZoomChange={(newZoom) => setZoom(Math.max(50, Math.min(200, newZoom)))}
                    />
                  </div>
                </div>

                <div className="score-canvas-footer">
                  <div>
                    <span className={`render-pill ${canRenderScore ? 'ready' : ''}`}>SVG {canRenderScore ? 'ready' : 'pending'}</span>
                    <span className={`render-pill audio ${buildResult?.hasPlayback ? 'ready' : ''}`}>
                      Audio {buildResult?.hasPlayback ? 'ready' : 'pending'}
                    </span>
                  </div>
                </div>

              </div>
            </section>

            {editorVisible && (
              <>
                <button
                  type="button"
                  className="editor-divider"
                  aria-label="Resize ABC editor"
                  onPointerDown={beginEditorResize}
                />
                <div className="editor-workspace-card" style={{ width: `${editorWidth}px` }}>
                  <AbcEditor
                    abcCode={abcCode}
                    onAbcChange={handleAbcChange}
                    revision={abcRevision}
                    validationState={buildStatus}
                    validationMessage={workspaceMessage}
                    visible={editorVisible}
                    onToggleVisibility={() => setEditorVisible(false)}
                  />
                </div>
              </>
            )}

            <div className="playback-dock-container">
              <AudioPlayer tunes={canRenderScore ? tunes : null} activeAnchor={activeAnchor} />
            </div>
          </div>
        </main>

        <div id="current-sheet-agent" className="right-panel">
          {chatOpen && (
            <button
              type="button"
              className="chat-rail-resize-handle"
              onPointerDown={beginChatResize}
              title="Drag to resize chat sidebar width"
              aria-label="Resize chat sidebar"
            />
          )}
          <AgentChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            fileId={activeFileId}
            abcCode={abcCode}
            activeFileName={scoreTitle}
            revision={abcRevision}
            activeAnchor={activeAnchor}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
