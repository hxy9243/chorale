import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileMusic, Plus, X } from 'lucide-react';
import { Header } from './components/Header';
import { FileRail } from './components/FileRail';
import { ScoreCardHeader } from './components/ScoreCardHeader';
import { ScoreMetadataHeader } from './components/ScoreMetadataHeader';
import { SheetMusicView } from './components/SheetMusicView';
import { AudioPlayer } from './components/AudioPlayer';
import { AbcEditor } from './components/AbcEditor';
import { WorkspacePaneMenu } from './components/workspace/WorkspacePaneMenu';
import { WorkspaceModals } from './components/workspace/WorkspaceModals';
import { useInterfaceZoom } from './hooks/useInterfaceZoom';
import {
  clampSheetZoom,
  useWorkspaceLayout,
  EDITOR_VISIBLE_KEY,
  EDITOR_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  FILE_RAIL_COLLAPSED_KEY,
  FILE_RAIL_ACTIVE_PANEL_KEY,
  SHEET_ZOOM_KEY,
} from './hooks/useWorkspaceLayout';
import { useDocumentStore } from './hooks/useDocumentStore';
import { useScoreExport, type ScoreExportFormat } from './hooks/useScoreExport';
import { useWorkspaceShortcuts } from './hooks/useWorkspaceShortcuts';
import { useWorkspacePanes } from './hooks/useWorkspacePanes';
import { useScorePreview } from './hooks/useScorePreview';
import { useScoreBuild, type BuildStatus } from './hooks/useScoreBuild';
import { usePluginMcpBridge } from './hooks/usePluginMcpBridge';
import type { ScoreAnchor } from './types/document';
import { parseAbcHeaderMetadata, type ScoreMetadata } from './utils/abcMetadata';
import type { PlaybackPosition } from './utils/repeatPlayback';
import { prepareAbcForPlayback } from './utils/abcAudio';
import { extractScore } from './music/scoreSnapshot';
import type { PlaybackSourceRanges } from './music/abcPresentation';

export {
  EDITOR_VISIBLE_KEY,
  EDITOR_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  FILE_RAIL_COLLAPSED_KEY,
  FILE_RAIL_ACTIVE_PANEL_KEY,
  SHEET_ZOOM_KEY,
  type BuildStatus,
};

const DEFAULT_SHEET_ZOOM = 100;

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
  } = useDocumentStore();

  const interfaceZoom = useInterfaceZoom();

  const {
    zoom,
    setZoom,
    editorVisible,
    setEditorVisible,
    fittedPanelLayout,
    railCollapsed,
    setRailCollapsed,
    railActivePanel,
    setRailActivePanel,
    beginEditorResize,
    beginEditorResizeFromRight,
    beginRailResize,
  } = useWorkspaceLayout(interfaceZoom);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [newScoreModalOpen, setNewScoreModalOpen] = useState(false);
  const [scoreNavigationAnchor, setScoreNavigationAnchor] = useState<ScoreAnchor | null>(null);
  const [playbackSourceRanges, setPlaybackSourceRanges] = useState<PlaybackSourceRanges | null>(null);

  const playbackPositionRef = useRef<PlaybackPosition>({
    currentSeconds: 0,
    isPlaying: false,
  });

  const openHistoryModal = useCallback(() => setHistoryModalOpen(true), []);
  const closeHistoryModal = useCallback(() => setHistoryModalOpen(false), []);
  const closeNewScoreModal = useCallback(() => setNewScoreModalOpen(false), []);

  // Keyboard shortcuts (Undo/Redo)
  useWorkspaceShortcuts({
    canUndo,
    canRedo,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  // Score proposal & preview lifecycle
  const {
    scorePreview,
    displayAbc,
    handleExitScorePreview,
  } = useScorePreview({
    activeFileId,
    abcCode,
    abcRevision,
    activeAnchor,
    setActiveAnchor,
    handleWholeScoreReplacement,
    handleMeasureMutation,
  });

  // ABC syntax compilation & validation lifecycle
  const {
    buildStatus,
    buildResult,
    tunes,
    canRenderScore,
    workspaceMessage,
    handleTuneRendered,
  } = useScoreBuild({
    activeDocument,
    displayAbc,
    abcRevision,
  });

  // Workspace tabbed panes & menu
  const {
    sheetVisible,
    sheetPaneOnRight,
    paneMenuOpen,
    paneMenuRef,
    openSheetPane,
    openEditorPane,
    closeSheetPane,
    togglePaneMenu,
  } = useWorkspacePanes();

  // Adjust state during render when activeFileId changes
  const [prevActiveFileId, setPrevActiveFileId] = useState(activeFileId);
  if (activeFileId !== prevActiveFileId) {
    setPrevActiveFileId(activeFileId);
    setScoreNavigationAnchor(null);
    setPlaybackSourceRanges(null);
  }

  // Adjust state during render when abcRevision changes
  const [prevAbcRevision, setPrevAbcRevision] = useState(abcRevision);
  if (abcRevision !== prevAbcRevision) {
    setPrevAbcRevision(abcRevision);
    setPlaybackSourceRanges(null);
  }

  const liveMetadata = useMemo(() => parseAbcHeaderMetadata(displayAbc), [displayAbc]);
  const scoreTitle = liveMetadata.title || activeDocument?.scoreInfo.title || activeFileName || 'Untitled score';
  const scoreComposer = liveMetadata.composer || activeDocument?.scoreInfo.composer || 'Unknown composer';
  const scoreKey = liveMetadata.key || activeDocument?.scoreInfo.key || 'C';
  const scoreMeter = liveMetadata.meter || activeDocument?.scoreInfo.meter || '4/4';
  const scoreTempoText = liveMetadata.tempoText || activeDocument?.scoreInfo.tempoText || (tunes?.[0]?.getBpm?.() ? `♩ = ${tunes[0].getBpm()}` : '♩ = 120');
  const scoreTempoBpm = liveMetadata.tempoBpm || (tunes?.[0]?.getBpm?.() ?? undefined);

  const handleMetadataChange = useCallback((updates: Partial<ScoreMetadata>) => {
    const effectiveUpdates = updates.subtitle !== undefined && !liveMetadata.title
      ? { title: scoreTitle, ...updates }
      : updates;
    handleUpdateMetadata(effectiveUpdates);
  }, [handleUpdateMetadata, liveMetadata.title, scoreTitle]);

  const totalMeasures = useMemo(() => {
    try {
      return extractScore(prepareAbcForPlayback(abcCode)).measures.length;
    } catch {
      return 0;
    }
  }, [abcCode]);

  const handleSelectAnchor = useCallback((anchor: ScoreAnchor | null) => {
    setScoreNavigationAnchor(null);
    setActiveAnchor(anchor);
  }, [setActiveAnchor]);

  const handleNavigateMeasure = useCallback((anchor: ScoreAnchor) => {
    setScoreNavigationAnchor(anchor);
  }, []);

  const getPlaybackPosition = useCallback(() => playbackPositionRef.current, []);

  const handlePlaybackPositionChange = useCallback((position: PlaybackPosition) => {
    playbackPositionRef.current = position;
  }, []);

  const { exportState: exportStatus, exportDocument, dismissStatus: dismissExportStatus } = useScoreExport();

  const handleExportDocument = (fileId: string, format: ScoreExportFormat = 'musicxml') => {
    const targetDoc = documents.find((doc) => doc.id === fileId);
    if (targetDoc) {
      void exportDocument(targetDoc, format);
    }
  };

  useEffect(() => {
    if (exportStatus.status !== 'success' && exportStatus.status !== 'error') return undefined;
    const timeout = window.setTimeout(() => dismissExportStatus(), 3500);
    return () => window.clearTimeout(timeout);
  }, [exportStatus.status, dismissExportStatus]);

  usePluginMcpBridge({
    enabled: true,
    documentId: activeDocument?.id,
    title: scoreTitle,
    revision: abcRevision,
    abcSource: displayAbc,
    selection: activeAnchor,
    onApplyAnnotations: handleAddAnnotations,
    onReplaceScore: handleWholeScoreReplacement,
  });

  return (
    <div className="chorale-app-shell">
      <div
        className={`workspace-body ${railCollapsed ? 'rail-collapsed' : ''} ${fittedPanelLayout.overlaySidePanels ? 'side-panels-overlay' : ''}`}
        style={{
          gridTemplateColumns: `${fittedPanelLayout.fileRailWidth}px minmax(0, 1fr)`,
          '--file-rail-width': `${fittedPanelLayout.fileRailWidth}px`,
        } as React.CSSProperties}
      >
        <FileRail
          documents={documents}
          activeFileId={activeFileId}
          onSelectDocument={handleSelectFile}
          onFileLoaded={handleProcessMusicXml}
          onNewScore={() => setNewScoreModalOpen(true)}
          onDeleteDocument={handleDeleteDocument}
          onDuplicateDocument={handleDuplicateDocument}
          onExportDocument={handleExportDocument}
          onReorderDocument={handleReorderDocument}
          loading={loading}
          error={error}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((c) => !c)}
          activePanel={railActivePanel}
          onActivePanelChange={setRailActivePanel}
          onBeginResize={beginRailResize}
          editorVisible={editorVisible}
          onToggleEditor={() => setEditorVisible((visible) => !visible)}
          onOpenHistory={openHistoryModal}
          historyCount={editingHistory.length}
        />

        <div className="central-column">
          <Header
            activeFileName={scoreTitle}
            saveStatus={activeDocument ? saveStatus : undefined}
            canRenderScore={activeDocument ? canRenderScore : undefined}
            hasPlayback={activeDocument ? (buildResult?.hasPlayback || false) : undefined}
            canUndo={activeDocument ? canUndo : false}
            canRedo={activeDocument ? canRedo : false}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
          <main
            className={`central-workspace ${sheetVisible ? 'sheet-open' : 'sheet-hidden'} ${editorVisible ? 'editor-open' : 'editor-hidden'}`}
            style={{ '--editor-panel-width': editorVisible ? `${fittedPanelLayout.editorPanelWidth}px` : '0px' } as React.CSSProperties}
          >
          <div className={`score-editor-shell ${!sheetVisible ? 'sheet-hidden' : ''} ${!editorVisible ? 'editor-hidden' : ''}`}>
            {sheetVisible && (
              <section className={`workspace-pane score-pane ${sheetPaneOnRight ? 'sheet-pane-on-right' : ''}`}>
                <div className="pane-tab-strip">
                  <div className="pane-tab active" role="tab" aria-selected="true">
                    <span className="pane-tab-title">Sheet</span>
                    <button
                      type="button"
                      className="pane-tab-close"
                      onClick={closeSheetPane}
                      title="Close Sheet pane"
                      aria-label="Close Sheet pane"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                  {!editorVisible && (
                    <div className="pane-tab-actions">
                      <button
                        type="button"
                        className="workspace-add-tab-btn"
                        onClick={togglePaneMenu}
                        title="Open pane"
                        aria-label="Open pane"
                        aria-haspopup="menu"
                        aria-expanded={paneMenuOpen}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      {paneMenuOpen && (
                        <WorkspacePaneMenu
                          paneMenuRef={paneMenuRef}
                          sheetVisible={sheetVisible}
                          editorVisible={editorVisible}
                          onOpenSheet={() => openSheetPane(editorVisible)}
                          onOpenEditor={() => openEditorPane(setEditorVisible)}
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="workspace-pane-card score-workspace-card">
                  <ScoreCardHeader
                    title={scoreTitle}
                    zoom={zoom}
                    onZoomIn={() => setZoom((z) => clampSheetZoom(z + 10))}
                    onZoomOut={() => setZoom((z) => clampSheetZoom(z - 10))}
                    onResetZoom={() => setZoom(DEFAULT_SHEET_ZOOM)}
                  />

                  {!activeDocument && (
                    <section className="empty-sheet-placeholder" aria-labelledby="empty-score-heading">
                      <h2 id="empty-score-heading">Start a score</h2>
                      <span>Create a blank piano score or import an existing file.</span>
                      <div className="empty-score-actions">
                        <button type="button" onClick={() => setNewScoreModalOpen(true)}>New Score</button>
                        <button type="button" onClick={() => document.querySelector<HTMLInputElement>('.file-rail input[type="file"]')?.click()}>Import Score</button>
                      </div>
                    </section>
                  )}
                  {activeDocument && <>
                  {scorePreview && (
                    <div className="score-preview-banner" role="status">
                      <span>Previewing {scorePreview.proposal.span.startMeasure === scorePreview.proposal.span.endMeasure
                        ? `measure ${scorePreview.proposal.span.startMeasure}`
                        : `measures ${scorePreview.proposal.span.startMeasure}–${scorePreview.proposal.span.endMeasure}`}</span>
                      <button type="button" onClick={handleExitScorePreview}>Back to current</button>
                    </div>
                  )}

                  <div className="score-canvas">
                    <div className="score-sheet">
                      {buildStatus === 'invalid' && (
                        <div className="workspace-status-row invalid" role="alert">
                          <span className="workspace-status-indicator invalid">Invalid ABC</span>
                          <span>{workspaceMessage}</span>
                        </div>
                      )}

                      <div className="score-view-wrapper">
                        <SheetMusicView
                          header={(
                            <ScoreMetadataHeader
                              title={scoreTitle}
                              subtitle={liveMetadata.subtitle}
                              composer={scoreComposer}
                              author={liveMetadata.author}
                              rhythm={liveMetadata.rhythm}
                              origin={liveMetadata.origin}
                              keySignature={scoreKey}
                              meter={scoreMeter}
                              tempoText={scoreTempoText}
                              tempoBpm={scoreTempoBpm}
                              onUpdateMetadata={handleMetadataChange}
                              disabled={Boolean(scorePreview)}
                            />
                          )}
                          abcCode={canRenderScore ? displayAbc : ''}
                          annotations={activeDocument?.annotations || []}
                          activeAnchor={activeAnchor}
                          navigationAnchor={scoreNavigationAnchor}
                          onSelectAnchor={handleSelectAnchor}
                          onTuneRendered={handleTuneRendered}
                          documentId={activeDocument.id}
                          revision={abcRevision}
                          getPlaybackPosition={getPlaybackPosition}
                          zoom={zoom}
                          interfaceZoom={interfaceZoom.zoom}
                          onZoomChange={(newZoom) => setZoom(clampSheetZoom(newZoom))}
                          meter={scoreMeter}
                          onCreateAnnotation={handleAddAnnotation}
                          onUpdateAnnotation={handleUpdateAnnotation}
                          onDeleteAnnotation={handleDeleteAnnotation}
                        />
                      </div>
                    </div>
                  </div>
                  </>}
                </div>
              </section>
            )}

            {sheetVisible && editorVisible && (
              <button
                type="button"
                className={`editor-divider ${sheetPaneOnRight ? 'sheet-pane-on-right' : ''}`}
                aria-label="Resize ABC editor"
                onPointerDown={sheetPaneOnRight ? beginEditorResizeFromRight : beginEditorResize}
              />
            )}

            {editorVisible && (
              <section
                className="workspace-pane editor-pane"
                style={{
                  width: sheetVisible ? `${fittedPanelLayout.editorPanelWidth}px` : '100%',
                  flex: sheetVisible ? 'none' : '1',
                }}
              >
                <div className="pane-tab-strip">
                  <div className="pane-tab active" role="tab" aria-selected="true">
                    <span className="pane-tab-title">ABC code</span>
                    <button
                      type="button"
                      className="pane-tab-close"
                      onClick={() => setEditorVisible(false)}
                      title="Close ABC source pane"
                      aria-label="Close ABC source pane"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="pane-tab-actions">
                    <button
                      type="button"
                      className="workspace-add-tab-btn"
                      onClick={togglePaneMenu}
                      title="Open pane"
                      aria-label="Open pane"
                      aria-haspopup="menu"
                      aria-expanded={paneMenuOpen}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                    {paneMenuOpen && (
                      <WorkspacePaneMenu
                        paneMenuRef={paneMenuRef}
                        sheetVisible={sheetVisible}
                        editorVisible={editorVisible}
                        onOpenSheet={() => openSheetPane(editorVisible)}
                        onOpenEditor={() => openEditorPane(setEditorVisible)}
                      />
                    )}
                  </div>
                </div>

                <div
                  className="workspace-pane-card editor-workspace-card"
                  style={{ width: sheetVisible ? `${fittedPanelLayout.editorPanelWidth}px` : '100%' }}
                >
                  <AbcEditor
                    abcCode={abcCode}
                    onAbcChange={handleAbcChange}
                    documentId={activeDocument?.id}
                    revision={abcRevision}
                    activeAnchor={activeAnchor}
                    onSelectAnchor={handleSelectAnchor}
                    onNavigateMeasure={handleNavigateMeasure}
                    onMeasureMutation={handleMeasureMutation}
                    playbackSourceRanges={playbackSourceRanges}
                    validationState={buildStatus}
                    validationMessage={workspaceMessage}
                    visible={editorVisible}
                  />
                </div>
              </section>
            )}

            {!sheetVisible && !editorVisible && (
              <div className="workspace-empty-panes" role="status">
                <div className="workspace-empty-panes-card">
                  <div className="workspace-empty-icon">
                    <FileMusic size={32} aria-hidden="true" />
                  </div>
                  <h3>No panes open</h3>
                  <p>Open Sheet music or ABC source to view and edit score content.</p>
                  <div className="workspace-empty-actions">
                    <button
                      type="button"
                      className="workspace-add-tab-btn empty-state-btn"
                      onClick={togglePaneMenu}
                      aria-haspopup="menu"
                      aria-expanded={paneMenuOpen}
                    >
                      <Plus size={15} aria-hidden="true" />
                      <span>Open Pane</span>
                    </button>
                    {paneMenuOpen && (
                      <WorkspacePaneMenu
                        paneMenuRef={paneMenuRef}
                        sheetVisible={sheetVisible}
                        editorVisible={editorVisible}
                        onOpenSheet={() => openSheetPane(editorVisible)}
                        onOpenEditor={() => openEditorPane(setEditorVisible)}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {sheetVisible && activeDocument && (
            <div className="playback-dock-container">
              <AudioPlayer
                tunes={canRenderScore ? tunes : null}
                totalMeasures={totalMeasures}
                activeAnchor={activeAnchor}
                onPlaybackPositionChange={handlePlaybackPositionChange}
                onPlaybackSourceRangesChange={setPlaybackSourceRanges}
              />
            </div>
          )}

          </main>
        </div>

      </div>
      <WorkspaceModals
        historyModalOpen={historyModalOpen}
        onCloseHistoryModal={closeHistoryModal}
        scoreTitle={scoreTitle}
        editingHistory={editingHistory}
        activeHistoryIndex={activeHistoryIndex}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRevertTo={handleRevertTo}
        newScoreModalOpen={newScoreModalOpen}
        onCloseNewScoreModal={closeNewScoreModal}
        onCreateDocument={handleCreateDocument}
        exportStatus={exportStatus}
      />
    </div>
  );
};

export default App;
