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
import {
  clampSheetZoom,
  useWorkspaceLayout,
  EDITOR_VISIBLE_KEY,
  EDITOR_WIDTH_KEY,
  CHAT_OPEN_KEY,
  CHAT_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  SHEET_ZOOM_KEY,
} from './hooks/useWorkspaceLayout';

export {
  EDITOR_VISIBLE_KEY,
  EDITOR_WIDTH_KEY,
  CHAT_OPEN_KEY,
  CHAT_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  SHEET_ZOOM_KEY,
};
import { useDocumentStore } from './hooks/useDocumentStore';
import type { BuildResult, ScoreAnchor } from './types/document';
import { parseAbcMetadata } from './utils/fileSession';
import type { PlaybackPosition } from './utils/repeatPlayback';
import { prepareAbcForPlayback } from './utils/abcAudio';

const DEFAULT_SHEET_ZOOM = 100;

type BuildStatus = 'idle' | 'building' | 'valid' | 'invalid';

const buildValidationMessage = (status: BuildStatus, buildResult: BuildResult | null) => {
  if (status === 'building') return 'Checking ABC syntax and rebuilding derived score output.';
  if (status === 'invalid') return buildResult?.errors[0]?.message || 'ABC could not be rebuilt.';
  if (status === 'valid' && buildResult) {
    return `Rendered ${buildResult.renderedTuneCount} tune${buildResult.renderedTuneCount === 1 ? '' : 's'} with playback ${buildResult.hasPlayback ? 'available' : 'disabled'}.`;
  }
  return null;
};

export const App: React.FC = () => {
  const {
    documents,
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
  } = useDocumentStore();

  const interfaceZoom = useInterfaceZoom();

  const {
    zoom,
    setZoom,
    chatOpen,
    setChatOpen,
    editorVisible,
    setEditorVisible,
    fittedPanelLayout,
    railCollapsed,
    setRailCollapsed,
    beginEditorResize,
    beginRailResize,
    beginChatResize,
  } = useWorkspaceLayout(interfaceZoom);

  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);

  const playbackPositionRef = useRef<PlaybackPosition>({
    currentSeconds: 0,
    isPlaying: false,
  });
  const buildRequestRef = useRef(0);

  const aiProviders = useAIProviders();
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

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
  }, [setActiveAnchor]);

  const getPlaybackPosition = useCallback(() => playbackPositionRef.current, []);

  const handlePlaybackPositionChange = useCallback((position: PlaybackPosition) => {
    playbackPositionRef.current = position;
  }, []);

  const isFirstBuildRef = useRef(true);
  const lastActiveDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeDocument || !abcCode.trim()) {
      setBuildStatus('idle');
      setBuildResult(null);
      setTunes(null);
      return;
    }

    const isDocSwitch = lastActiveDocIdRef.current !== activeDocument.id;
    lastActiveDocIdRef.current = activeDocument.id;

    const requestId = ++buildRequestRef.current;
    const delay = (isFirstBuildRef.current || isDocSwitch) ? 0 : 140;
    isFirstBuildRef.current = false;
    const timeout = window.setTimeout(() => {
      try {
        const parsedTunes = typeof abcjs.parseOnly === 'function'
          ? abcjs.parseOnly(prepareAbcForPlayback(abcCode))
          : abcjs.renderAbc(document.createElement('div'), prepareAbcForPlayback(abcCode));
        if (requestId !== buildRequestRef.current) return;

        const result: BuildResult = {
          fileId: activeDocument.id,
          revision: abcRevision,
          validation: 'valid',
          errors: [],
          renderedTuneCount: parsedTunes?.length || 0,
          hasPlayback: (parsedTunes?.length || 0) > 0,
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
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [abcCode, abcRevision, activeDocument]);

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
        className={`workspace-body ${chatOpen ? 'chat-open' : ''} ${railCollapsed ? 'rail-collapsed' : ''} ${fittedPanelLayout.overlaySidePanels ? 'side-panels-overlay' : ''}`}
        style={{
          gridTemplateColumns: `${railCollapsed ? 0 : fittedPanelLayout.fileRailWidth}px minmax(0, 1fr) ${chatOpen ? `${fittedPanelLayout.chatPanelWidth}px` : '0px'}`,
          '--file-rail-width': `${railCollapsed ? 0 : fittedPanelLayout.fileRailWidth}px`,
          '--chat-rail-width': chatOpen ? `${fittedPanelLayout.chatPanelWidth}px` : '0px',
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
          style={{ '--editor-panel-width': editorVisible ? `${fittedPanelLayout.editorPanelWidth}px` : '0px' } as React.CSSProperties}
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
                <div className="editor-workspace-card" style={{ width: `${fittedPanelLayout.editorPanelWidth}px` }}>
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
