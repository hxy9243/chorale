import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Header } from './components/Header';
import { FileRail } from './components/FileRail';
import { ScoreCardHeader } from './components/ScoreCardHeader';
import { SheetMusicView } from './components/SheetMusicView';
import { AudioPlayer } from './components/AudioPlayer';
import { AbcEditor } from './components/AbcEditor';
import { AgentChatPanel } from './components/AgentChatPanel';
import { AISettingsModal } from './components/AISettingsModal';
import { useAIProviders } from './agent/useAIProviders';
import { useInterfaceZoom } from './hooks/useInterfaceZoom';
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
import type { PlaybackPosition } from './utils/repeatPlayback';
import { prepareAbcForPlayback } from './utils/abcAudio';
import {
  clampChatPanelWidth,
  clampFileRailWidth,
  defaultFileRailWidth,
} from './utils/workspaceSizing';

const EDITOR_VISIBLE_KEY = 'chorale.workspace.editorVisible';
export const EDITOR_WIDTH_KEY = 'chorale.workspace.editorWidth';
const DOCUMENTS_STORAGE_KEY = 'chorale.workspace.documents';
const ACTIVE_FILE_KEY = 'chorale.workspace.activeFileId';
export const CHAT_OPEN_KEY = 'chorale.workspace.chatOpen';
export const CHAT_WIDTH_KEY = 'chorale.workspace.chatWidth';
export const FILE_RAIL_WIDTH_KEY = 'chorale.workspace.fileRailWidth';
export const SHEET_ZOOM_KEY = 'chorale.workspace.sheetZoom';
const DEFAULT_EDITOR_WIDTH = 420;
const MIN_EDITOR_WIDTH = 320;
const MAX_EDITOR_WIDTH = 720;
const DEFAULT_SHEET_ZOOM = 100;
const MIN_SHEET_ZOOM = 50;
const MAX_SHEET_ZOOM = 200;
const AUTOSAVE_DELAY_MS = 400;

type BuildStatus = 'idle' | 'building' | 'valid' | 'invalid';

const clampEditorWidth = (width: number) => Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, width));
const clampSheetZoom = (zoom: number) => Math.max(MIN_SHEET_ZOOM, Math.min(MAX_SHEET_ZOOM, zoom));

const readStoredBool = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
};

const readStoredNumber = (
  key: string,
  fallback: number,
  clamp: (value: number) => number,
) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? clamp(value) : fallback;
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
  const playbackPositionRef = useRef<PlaybackPosition>({
    currentSeconds: 0,
    isPlaying: false,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(() => readStoredBool(CHAT_OPEN_KEY, true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const aiProviders = useAIProviders();
  const interfaceZoom = useInterfaceZoom();
  const layoutViewportWidth = useCallback(
    () => window.innerWidth * 100 / interfaceZoom.zoom,
    [interfaceZoom.zoom],
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [zoom, setZoom] = useState<number>(() => (
    readStoredNumber(SHEET_ZOOM_KEY, DEFAULT_SHEET_ZOOM, clampSheetZoom)
  ));
  const [editorVisible, setEditorVisible] = useState<boolean>(() => readStoredBool(EDITOR_VISIBLE_KEY, false));
  const [editorWidth, setEditorWidth] = useState<number>(() => (
    readStoredNumber(EDITOR_WIDTH_KEY, DEFAULT_EDITOR_WIDTH, clampEditorWidth)
  ));
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const loadRequestRef = useRef(0);
  const buildRequestRef = useRef(0);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeDocument = documents.find((doc) => doc.id === activeFileId);
  const activeFileName = activeDocument?.name || '';
  const abcCode = activeDocument?.abcSource || '';
  const abcRevision = activeDocument?.revision || 0;
  const saveState = !activeDocument
    ? 'No file'
    : saveStatus === 'saving'
      ? 'Saving'
      : saveStatus === 'error'
        ? 'Error'
        : 'Saved';
  const saveLabel = saveState === 'Saved'
    ? 'Auto-saved'
    : saveState === 'Saving'
      ? 'Saving…'
      : saveState === 'Error'
        ? 'Save failed'
        : saveState;
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

  const getPlaybackPosition = useCallback(() => playbackPositionRef.current, []);

  const handlePlaybackPositionChange = useCallback((position: PlaybackPosition) => {
    playbackPositionRef.current = position;
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
    window.localStorage.setItem(SHEET_ZOOM_KEY, String(zoom));
  }, [zoom]);

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
        const renderedTunes = abcjs.renderAbc(scratch, prepareAbcForPlayback(abcCode), {
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

  const handleReorderDocument = (
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

  const [railWidth, setRailWidth] = useState<number>(() => (
    readStoredNumber(
      FILE_RAIL_WIDTH_KEY,
      defaultFileRailWidth(layoutViewportWidth()),
      clampFileRailWidth,
    )
  ));
  const [railCollapsed, setRailCollapsed] = useState<boolean>(false);
  const railDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    window.localStorage.setItem(FILE_RAIL_WIDTH_KEY, String(Math.round(railWidth)));
  }, [railWidth]);

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
      const newWidth = clampFileRailWidth(dragState.startWidth + delta);
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

  const [chatWidth, setChatWidth] = useState<number>(() => (
    readStoredNumber(
      CHAT_WIDTH_KEY,
      clampChatPanelWidth(392, layoutViewportWidth()),
      (width) => clampChatPanelWidth(width, layoutViewportWidth()),
    )
  ));
  const chatDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setChatWidth((current) => clampChatPanelWidth(current, layoutViewportWidth()));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [layoutViewportWidth]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_OPEN_KEY, String(chatOpen));
  }, [chatOpen]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(chatWidth)));
  }, [chatWidth]);

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
      const newWidth = clampChatPanelWidth(
        dragState.startWidth + delta,
        layoutViewportWidth(),
      );
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
      />

      <div
        className={`workspace-body ${chatOpen ? 'chat-open' : ''} ${railCollapsed ? 'rail-collapsed' : ''}`}
        style={{
          gridTemplateColumns: `${railCollapsed ? 0 : railWidth}px minmax(0, 1fr) ${chatOpen ? `${chatWidth}px` : '0px'}`,
          '--file-rail-width': `${railCollapsed ? 0 : railWidth}px`,
          '--chat-rail-width': chatOpen ? `${chatWidth}px` : '0px',
        } as React.CSSProperties}
      >
        <FileRail
          documents={documents}
          activeFileId={activeFileId}
          onSelectDocument={handleSelectFile}
          onFileLoaded={handleProcessMusicXml}
          onDeleteDocument={handleDeleteDocument}
          onReorderDocument={handleReorderDocument}
          loading={loading}
          error={error}
          collapsed={railCollapsed}
          onBeginResize={beginRailResize}
          editorVisible={editorVisible}
          onToggleEditor={() => setEditorVisible((visible) => !visible)}
          onOpenSettings={openSettings}
        />

        <main
          className={`central-workspace ${editorVisible ? 'editor-open' : 'editor-hidden'}`}
          style={{ '--editor-panel-width': editorVisible ? `${editorWidth}px` : '0px' } as React.CSSProperties}
        >
          <div className="score-editor-shell">
            <section className="score-workspace-card">
              <ScoreCardHeader
                title={scoreTitle}
                zoom={zoom}
                onZoomIn={() => setZoom((z) => clampSheetZoom(z + 10))}
                onZoomOut={() => setZoom((z) => clampSheetZoom(z - 10))}
                onResetZoom={() => setZoom(DEFAULT_SHEET_ZOOM)}
              />

              <div className="score-canvas">
                <div className="score-sheet">
                  <div className="score-sheet-heading">
                    <div>
                      <h1>{scoreTitle}</h1>
                      <p>{scoreComposer}</p>
                      <div className="score-build-status" role="status" aria-live="polite">
                        <span className={`score-status-item save ${saveStatus}`}>
                          {saveLabel}
                        </span>
                        <span className={`score-status-item svg ${canRenderScore ? 'ready' : ''}`}>
                          SVG {canRenderScore ? 'ready' : 'pending'}
                        </span>
                        <span className={`score-status-item audio ${buildResult?.hasPlayback ? 'ready' : ''}`}>
                          Audio {buildResult?.hasPlayback ? 'ready' : 'pending'}
                        </span>
                      </div>
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
                      getPlaybackPosition={getPlaybackPosition}
                      zoom={zoom}
                      onZoomChange={(newZoom) => setZoom(clampSheetZoom(newZoom))}
                    />
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
          </div>

          <div className="playback-dock-container">
            <AudioPlayer
              tunes={canRenderScore ? tunes : null}
              activeAnchor={activeAnchor}
              onPlaybackPositionChange={handlePlaybackPositionChange}
            />
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
            ai={aiProviders}
            onOpenSettings={openSettings}
          />
        </div>
      </div>
      <AISettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        ai={aiProviders}
        interfaceZoom={interfaceZoom.zoom}
        onInterfaceZoomChange={interfaceZoom.setZoom}
      />
    </div>
  );
};

export default App;
