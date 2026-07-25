import React, { useState, useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import { Header } from './components/Header';
import { FileSelector } from './components/FileSelector';
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
    <div className="app-container">
      <Header chatOpen={chatOpen} onToggleChat={() => setChatOpen((open) => !open)} />

      <div className={`app-workspace ${chatOpen ? 'chat-open' : ''}`}>
        <main className="app-grid">
          <div className="app-grid-top">
            <FileSelector
              onFileLoaded={handleProcessMusicXml}
              onSampleSelected={loadSample}
              activeFileName={activeFileName}
              loading={loading}
              error={error}
            />
            <AudioPlayer tunes={tunes} />
          </div>

          <SheetMusicView
            abcCode={abcCode}
            onTuneRendered={(renderedTunes) => setTunes(renderedTunes)}
          />

          <AbcEditor
            abcCode={abcCode}
            onAbcChange={(newAbc) => setAbcCode(newAbc)}
          />
        </main>

        <div id="current-sheet-agent">
          <AgentChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            abcCode={abcCode}
            activeFileName={activeFileName}
            revision={abcRevision}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
