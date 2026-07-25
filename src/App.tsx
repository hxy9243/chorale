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
import { PRESET_SAMPLES } from './data/samples';
import { extractMusicXml, parseMusicXmlToAbc } from './utils/xmlParser';

export const App: React.FC = () => {
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [abcCode, setAbcCode] = useState<string>('');
  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [abcRevision, setAbcRevision] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(100);
  const loadRequestRef = useRef(0);

  // Load initial preset sample on mount
  useEffect(() => {
    if (PRESET_SAMPLES.length > 0) {
      loadSample(PRESET_SAMPLES[0]);
    }
  }, []);

  useEffect(() => {
    if (abcCode.trim()) setAbcRevision((revision) => revision + 1);
  }, [abcCode]);

  const handleProcessMusicXml = async (fileData: ArrayBuffer | string, fileName: string) => {
    const requestId = ++loadRequestRef.current;
    try {
      setLoading(true);
      setError(null);
      setActiveFileName(fileName);

      const xmlText = await extractMusicXml(fileData);
      const abc = parseMusicXmlToAbc(xmlText);
      if (requestId !== loadRequestRef.current) return;
      setAbcCode(abc);
    } catch (err: any) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Error parsing MusicXML:', err);
      setError(err?.message || 'Failed to parse MusicXML file.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const loadSample = async (sample: MusicSample) => {
    const requestId = ++loadRequestRef.current;
    try {
      setLoading(true);
      setError(null);
      setActiveFileName(`${sample.title} (${sample.type.toUpperCase()})`);

      const response = await fetch(sample.filename);
      if (!response.ok) {
        throw new Error(`Failed to fetch sample file: ${response.statusText}`);
      }

      if (sample.type === 'mxl') {
        const buffer = await response.arrayBuffer();
        const xmlText = await extractMusicXml(buffer);
        const abc = parseMusicXmlToAbc(xmlText);
        if (requestId !== loadRequestRef.current) return;
        setAbcCode(abc);
      } else {
        const text = await response.text();
        const abc = parseMusicXmlToAbc(text);
        if (requestId !== loadRequestRef.current) return;
        setAbcCode(abc);
      }
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
          activeFileName={activeFileName}
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
              onAbcChange={(newAbc) => setAbcCode(newAbc)}
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

