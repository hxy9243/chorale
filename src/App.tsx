import React, { useState, useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import { Header } from './components/Header';
import { FileRail } from './components/FileRail';
import { ScoreCardHeader } from './components/ScoreCardHeader';
import { SheetMusicView } from './components/SheetMusicView';
import { AudioPlayer } from './components/AudioPlayer';
import { AbcEditor } from './components/AbcEditor';
import { AgentChatPanel } from './components/AgentChatPanel';
import type { MusicSample } from './types/music';
import type { FileDocument } from './types/document';
import { PRESET_SAMPLES } from './data/samples';
import { extractMusicXml, parseMusicXmlToAbc } from './utils/xmlParser';
import { createDocumentFromAbc, updateDocumentAbc, sampleToDocument } from './utils/fileSession';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<FileDocument[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(100);
  const loadRequestRef = useRef(0);

  const activeDocument = documents.find((doc) => doc.id === activeFileId);
  const activeFileName = activeDocument?.name || '';
  const abcCode = activeDocument?.abcSource || '';
  const abcRevision = activeDocument?.revision || 0;

  // Load initial preset sample on mount
  useEffect(() => {
    if (PRESET_SAMPLES.length > 0) {
      loadSample(PRESET_SAMPLES[0]);
    }
  }, []);

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

      setDocuments((prevDocs) => [...prevDocs.filter((d) => d.name !== fileName), newDoc]);
      setActiveFileId(newDoc.id);
    } catch (err: any) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Error parsing file:', err);
      setError(err?.message || 'Failed to parse file.');
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
    } catch (err: any) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Error loading sample:', err);
      setError(err?.message || 'Failed to load sample track.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="chorale-app-shell">
      <Header
        activeFileName={activeFileName}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
      />

      <div className={`workspace-body ${chatOpen ? 'chat-open' : ''}`}>
        <FileRail
          documents={documents}
          activeFileId={activeFileId}
          onSelectDocument={(id) => setActiveFileId(id)}
          onFileLoaded={handleProcessMusicXml}
          onSampleSelected={loadSample}
          loading={loading}
          error={error}
        />

        <main className="central-workspace">
          <div className="score-workspace-card">
            <ScoreCardHeader
              title={activeFileName}
              zoom={zoom}
              onZoomIn={() => setZoom((z) => Math.min(z + 10, 200))}
              onZoomOut={() => setZoom((z) => Math.max(z - 10, 50))}
              onResetZoom={() => setZoom(100)}
            />

            <div className="score-view-wrapper">
              <SheetMusicView
                abcCode={abcCode}
                onTuneRendered={(renderedTunes) => setTunes(renderedTunes)}
              />
            </div>
          </div>

          <div className="editor-workspace-card">
            <AbcEditor
              abcCode={abcCode}
              onAbcChange={handleAbcChange}
            />
          </div>
        </main>

        <div id="current-sheet-agent" className="right-panel">
          <AgentChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            abcCode={abcCode}
            activeFileName={activeFileName}
            revision={abcRevision}
          />
        </div>
      </div>

      <footer className="playback-dock-container">
        <AudioPlayer tunes={tunes} />
      </footer>
    </div>
  );
};

export default App;


