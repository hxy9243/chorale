import React, { useState, useEffect } from 'react';
import abcjs from 'abcjs';
import { Header } from './components/Header';
import { FileSelector } from './components/FileSelector';
import { SheetMusicView } from './components/SheetMusicView';
import { AudioPlayer } from './components/AudioPlayer';
import { AbcEditor } from './components/AbcEditor';
import type { MusicSample } from './types/music';
import { PRESET_SAMPLES } from './data/samples';
import { extractMusicXml, parseMusicXmlToAbc } from './utils/xmlParser';

export const App: React.FC = () => {
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [abcCode, setAbcCode] = useState<string>('');
  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial preset sample on mount
  useEffect(() => {
    if (PRESET_SAMPLES.length > 0) {
      loadSample(PRESET_SAMPLES[0]);
    }
  }, []);

  const handleProcessMusicXml = async (fileData: ArrayBuffer | string, fileName: string) => {
    try {
      setLoading(true);
      setError(null);
      setActiveFileName(fileName);

      const xmlText = await extractMusicXml(fileData);
      const abc = parseMusicXmlToAbc(xmlText);
      setAbcCode(abc);
    } catch (err: any) {
      console.error('Error parsing MusicXML:', err);
      setError(err?.message || 'Failed to parse MusicXML file.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = async (sample: MusicSample) => {
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
        setAbcCode(abc);
      } else {
        const text = await response.text();
        const abc = parseMusicXmlToAbc(text);
        setAbcCode(abc);
      }
    } catch (err: any) {
      console.error('Error loading sample:', err);
      setError(err?.message || 'Failed to load sample track.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Header />

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
    </div>
  );
};

export default App;
