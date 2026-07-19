import React from 'react';
import { Music, Sparkles } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon">
          <Music className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="brand-title">Chorale Player</h1>
          <p className="brand-subtitle">MusicXML &rarr; ABC Sheet Music & WebAudio Synth</p>
        </div>
      </div>
      <div className="header-actions">
        <span className="badge badge-poc">
          <Sparkles className="w-3.5 h-3.5 inline mr-1" />
          abcjs + xml2abc PoC
        </span>
      </div>
    </header>
  );
};
