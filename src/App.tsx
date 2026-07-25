import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { createDocumentFromAbc, updateDocumentAbc, sampleToDocument } from './utils/fileSession';
import { formatAnchorLabel } from './utils/anchor';

const EDITOR_VISIBLE_KEY = 'chorale.workspace.editorVisible';
const EDITOR_WIDTH_KEY = 'chorale.workspace.editorWidth';
const DEFAULT_EDITOR_WIDTH = 420;
const MIN_EDITOR_WIDTH = 320;
const MAX_EDITOR_WIDTH = 720;

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

const deriveSaveState = (document?: FileDocument) => {
  if (!document) return 'No file';
  const lastVersion = document.versions[document.versions.length - 1];
  if (!lastVersion) return 'Imported';
  return lastVersion.reason === 'manual-edit' ? 'Draft' : 'Imported';
};

const buildValidationMessage = (status: BuildStatus, buildResult: BuildResult | null) => {
  if (status === 'building') return 'Checking ABC syntax and rebuilding derived score output.';
  if (status === 'invalid') return buildResult?.errors[0]?.message || 'ABC could not be rebuilt.';
  if (status === 'valid' && buildResult) {
    return `Rendered ${buildResult.renderedTuneCount} tune${buildResult.renderedTuneCount === 1 ? '' : 's'} with playback ${buildResult.hasPlayback ? 'available' : 'disabled'}.`;
  }
  return null;
};

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<FileDocument[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [activeAnchor, setActiveAnchor] = useState<ScoreAnchor | null>(null);
  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(100);
  const [editorVisible, setEditorVisible] = useState<boolean>(() => readStoredBool(EDITOR_VISIBLE_KEY, true));
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
  const saveState = deriveSaveState(activeDocument);
  const canRenderScore = buildStatus === 'valid';

  useEffect(() => {
    if (PRESET_SAMPLES.length > 0) {
      void loadSample(PRESET_SAMPLES[0]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_VISIBLE_KEY, String(editorVisible));
  }, [editorVisible]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_WIDTH_KEY, String(editorWidth));
  }, [editorWidth]);

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

  const workspaceMessage = useMemo(
    () => buildValidationMessage(buildStatus, buildResult),
    [buildResult, buildStatus],
  );

  return (
    <div className="chorale-app-shell">
      <Header
        activeFileName={activeFileName}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
        saveState={saveState}
      />

      <div className={`workspace-body ${chatOpen ? 'chat-open' : ''}`}>
        <FileRail
          documents={documents}
          activeFileId={activeFileId}
          onSelectDocument={handleSelectFile}
          onFileLoaded={handleProcessMusicXml}
          onSampleSelected={loadSample}
          loading={loading}
          error={error}
        />

        <main className="central-workspace">
          <div className={`score-editor-shell ${editorVisible ? 'editor-open' : 'editor-hidden'}`}>
            <section className="score-workspace-card">
              <ScoreCardHeader
                title={activeFileName}
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

              <div className="workspace-status-row">
                <span className={`workspace-status-indicator ${buildStatus}`}>{buildStatus}</span>
                <span>{workspaceMessage || 'Load or edit a score to begin.'}</span>
              </div>

              <div className="score-view-wrapper">
                <SheetMusicView
                  abcCode={canRenderScore ? abcCode : ''}
                  activeAnchor={activeAnchor}
                  onSelectAnchor={setActiveAnchor}
                  onTuneRendered={(renderedTunes) => setTunes(renderedTunes)}
                />
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
        </main>

        <div id="current-sheet-agent" className="right-panel">
          <AgentChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            fileId={activeFileId}
            abcCode={abcCode}
            activeFileName={activeFileName}
            revision={abcRevision}
            activeAnchor={activeAnchor}
          />
        </div>
      </div>

      <footer className="playback-dock-container">
        <AudioPlayer tunes={canRenderScore ? tunes : null} activeAnchor={activeAnchor} />
      </footer>
    </div>
  );
};

export default App;
