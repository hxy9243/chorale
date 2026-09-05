import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Header } from './components/Header';
import { FileRail } from './components/FileRail';
import { RightRail } from './components/RightRail';
import { ScoreCardHeader } from './components/ScoreCardHeader';
import { ScoreMetadataHeader } from './components/ScoreMetadataHeader';
import { SheetMusicView } from './components/SheetMusicView';
import { AudioPlayer } from './components/AudioPlayer';
import { AbcEditor } from './components/AbcEditor';
import { AgentChatPanel } from './components/AgentChatPanel';
import { AISettingsModal } from './components/AISettingsModal';
import { EditingHistoryModal } from './components/EditingHistoryModal';
import { NewScoreModal } from './components/NewScoreModal';
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
  FILE_RAIL_COLLAPSED_KEY,
  FILE_RAIL_ACTIVE_PANEL_KEY,
  SHEET_ZOOM_KEY,
} from './hooks/useWorkspaceLayout';

export {
  EDITOR_VISIBLE_KEY,
  EDITOR_WIDTH_KEY,
  CHAT_OPEN_KEY,
  CHAT_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  FILE_RAIL_COLLAPSED_KEY,
  FILE_RAIL_ACTIVE_PANEL_KEY,
  SHEET_ZOOM_KEY,
};
import { useDocumentStore } from './hooks/useDocumentStore';
import { useScoreExport, type ScoreExportFormat } from './hooks/useScoreExport';
import type { BuildResult, ScoreAnchor, ScoreChangeProposal } from './types/document';
import { parseAbcHeaderMetadata, type ScoreMetadata } from './utils/abcMetadata';
import type { PlaybackPosition } from './utils/repeatPlayback';
import { prepareAbcForPlayback } from './utils/abcAudio';
import { extractScore } from './music/scoreSnapshot';
import {
  applyMeasureMutation,
  applyWholeScoreReplacement,
} from './music/scoreDrafting';
import { FILE_RAIL_BAR_WIDTH } from './utils/workspaceSizing';
import type { PlaybackSourceRanges } from './music/abcPresentation';

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
    chatOpen,
    setChatOpen,
    editorVisible,
    setEditorVisible,
    fittedPanelLayout,
    railCollapsed,
    setRailCollapsed,
    railActivePanel,
    setRailActivePanel,
    beginEditorResize,
    beginRailResize,
    beginChatResize,
  } = useWorkspaceLayout(interfaceZoom);

  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [newScoreModalOpen, setNewScoreModalOpen] = useState(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [scoreNavigationAnchor, setScoreNavigationAnchor] = useState<ScoreAnchor | null>(null);
  const [scorePreview, setScorePreview] = useState<{
    proposal: ScoreChangeProposal;
    abcSource: string;
    previousAnchor: ScoreAnchor | null;
  } | null>(null);
  const [playbackSourceRanges, setPlaybackSourceRanges] = useState<PlaybackSourceRanges | null>(null);

  const playbackPositionRef = useRef<PlaybackPosition>({
    currentSeconds: 0,
    isPlaying: false,
  });
  const buildRequestRef = useRef(0);

  const aiProviders = useAIProviders();
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openHistoryModal = useCallback(() => setHistoryModalOpen(true), []);
  const closeHistoryModal = useCallback(() => setHistoryModalOpen(false), []);
  const closeNewScoreModal = useCallback(() => setNewScoreModalOpen(false), []);

  // Global Undo / Redo keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.editor-workspace-card') ||
          target.closest('.chat-panel'));

      if (isInput) return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      if (isCmdOrCtrl && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) handleRedo();
        } else {
          if (canUndo) handleUndo();
        }
      } else if (isCmdOrCtrl && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        if (canRedo) handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, handleUndo, handleRedo]);

  const displayAbc = scorePreview?.abcSource || abcCode;
  const canRenderScore = buildStatus === 'valid';
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
    setScoreNavigationAnchor(null);
    setActiveAnchor(anchor);
  }, [setActiveAnchor]);

  const handleNavigateMeasure = useCallback((anchor: ScoreAnchor) => {
    setScoreNavigationAnchor(anchor);
  }, []);

  useEffect(() => {
    setScoreNavigationAnchor(null);
    setScorePreview(null);
    setPlaybackSourceRanges(null);
  }, [activeFileId]);

  useEffect(() => {
    setPlaybackSourceRanges(null);
  }, [abcRevision]);

  useEffect(() => {
    if (scorePreview && scorePreview.proposal.sourceRevision !== abcRevision) {
      setActiveAnchor(null);
      setScorePreview(null);
    }
  }, [abcRevision, scorePreview, setActiveAnchor]);

  const handlePreviewScoreProposal = useCallback((proposal: ScoreChangeProposal) => {
    if (proposal.documentId !== activeFileId || proposal.sourceRevision !== abcRevision) return 'outdated' as const;
    const result = proposal.kind === 'replace-score'
      ? applyWholeScoreReplacement(abcCode, proposal.replacementAbc)
      : applyMeasureMutation(abcCode, {
          kind: 'replace', span: proposal.span, replacementAbc: proposal.replacementAbc,
        });
    if (result.status !== 'valid') return 'invalid' as const;
    setScorePreview({
      proposal,
      abcSource: result.abcSource,
      previousAnchor: scorePreview?.previousAnchor ?? activeAnchor,
    });
    setActiveAnchor(proposal.span);
    return 'ready' as const;
  }, [abcCode, abcRevision, activeAnchor, activeFileId, scorePreview, setActiveAnchor]);

  const handleApplyScoreProposal = useCallback((proposal: ScoreChangeProposal) => {
    if (proposal.documentId !== activeFileId || proposal.sourceRevision !== abcRevision) return 'outdated' as const;
    const result = proposal.kind === 'replace-score'
      ? handleWholeScoreReplacement(proposal.replacementAbc, 'tool-apply')
      : handleMeasureMutation({
          kind: 'replace', span: proposal.span, replacementAbc: proposal.replacementAbc,
        }, 'tool-apply');
    if (result.status !== 'valid') return 'invalid' as const;
    setScorePreview(null);
    return 'accepted' as const;
  }, [abcRevision, activeFileId, handleMeasureMutation, handleWholeScoreReplacement]);

  const handleDiscardScoreProposal = useCallback((proposal: ScoreChangeProposal) => {
    if (scorePreview?.proposal.id !== proposal.id) return;
    setActiveAnchor(scorePreview.previousAnchor);
    setScorePreview(null);
  }, [scorePreview, setActiveAnchor]);

  const handleExitScorePreview = useCallback(() => {
    if (!scorePreview) return;
    setActiveAnchor(scorePreview.previousAnchor);
    setScorePreview(null);
  }, [scorePreview, setActiveAnchor]);

  const getPlaybackPosition = useCallback(() => playbackPositionRef.current, []);

  const handlePlaybackPositionChange = useCallback((position: PlaybackPosition) => {
    playbackPositionRef.current = position;
  }, []);

  const isFirstBuildRef = useRef(true);
  const lastActiveDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeDocument || !displayAbc.trim()) {
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
          ? abcjs.parseOnly(prepareAbcForPlayback(displayAbc))
          : abcjs.renderAbc(document.createElement('div'), prepareAbcForPlayback(displayAbc));
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
  }, [displayAbc, abcRevision, activeDocument]);

  const workspaceMessage = useMemo(
    () => buildValidationMessage(buildStatus, buildResult),
    [buildResult, buildStatus],
  );

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

  const chatColumnWidth = FILE_RAIL_BAR_WIDTH + (chatOpen ? fittedPanelLayout.chatPanelWidth : 0);

  return (
    <div className="chorale-app-shell">
      <div
        className={`workspace-body ${chatOpen ? 'chat-open' : ''} ${railCollapsed ? 'rail-collapsed' : ''} ${fittedPanelLayout.overlaySidePanels ? 'side-panels-overlay' : ''}`}
        style={{
          gridTemplateColumns: `${fittedPanelLayout.fileRailWidth}px minmax(0, 1fr) ${chatColumnWidth}px`,
          '--file-rail-width': `${fittedPanelLayout.fileRailWidth}px`,
          '--chat-rail-width': `${chatColumnWidth}px`,
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
          onOpenSettings={openSettings}
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
              onPlaybackSourceRangesChange={setPlaybackSourceRanges}
            />
          </div>
          </main>
        </div>

        <div id="current-sheet-agent" className="right-panel">
          <div id="chat-panel" className="chat-panel-stack">
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
              onClose={() => {
                setChatOpen(false);
                handleExitScorePreview();
              }}
              fileId={activeFileId}
              abcCode={abcCode}
              activeFileName={scoreTitle}
              revision={abcRevision}
              annotations={activeDocument?.annotations || []}
              activeAnchor={activeAnchor}
              onClearAnchor={() => handleSelectAnchor(null)}
              totalMeasures={totalMeasures}
              scoreMeter={scoreMeter}
              ai={aiProviders}
              onOpenSettings={openSettings}
              onNavigateMeasure={handleNavigateMeasure}
              onApplyAnnotations={handleAddAnnotations}
              onPreviewScoreProposal={handlePreviewScoreProposal}
              onApplyScoreProposal={handleApplyScoreProposal}
              onDiscardScoreProposal={handleDiscardScoreProposal}
            />
          </div>
          <RightRail
            chatOpen={chatOpen}
            onToggleChat={() => setChatOpen((open) => !open)}
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
      <EditingHistoryModal
        open={historyModalOpen}
        onClose={closeHistoryModal}
        scoreTitle={scoreTitle}
        history={editingHistory}
        activeHistoryIndex={activeHistoryIndex}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRevertTo={handleRevertTo}
      />
      <NewScoreModal
        open={newScoreModalOpen}
        onClose={closeNewScoreModal}
        onCreate={handleCreateDocument}
      />
      {exportStatus.status === 'success' && (
        <div className="export-status-toast" role="status">
          Exported {exportStatus.message ?? 'file'}
        </div>
      )}
      {exportStatus.status === 'error' && (
        <div className="export-status-toast error" role="alert">
          Export failed: {exportStatus.message ?? 'unknown error'}
        </div>
      )}
    </div>
  );
};

export default App;
