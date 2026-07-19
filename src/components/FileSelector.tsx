import React, { useState, useRef } from 'react';
import { Upload, FileCode, CheckCircle2, AlertCircle } from 'lucide-react';
import type { MusicSample } from '../types/music';
import { PRESET_SAMPLES } from '../data/samples';

interface FileSelectorProps {
  onFileLoaded: (fileData: ArrayBuffer | string, fileName: string) => void;
  onSampleSelected: (sample: MusicSample) => void;
  activeFileName: string;
  loading: boolean;
  error: string | null;
}

export const FileSelector: React.FC<FileSelectorProps> = ({
  onFileLoaded,
  onSampleSelected,
  activeFileName,
  loading,
  error,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onFileLoaded(event.target.result, file.name);
      }
    };
    if (file.name.endsWith('.mxl')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="file-selector-card glass-panel">
      <div className="selector-header">
        <h3 className="section-title">
          <Upload className="w-4 h-4 inline mr-2 text-emerald-400" />
          MusicXML Source
        </h3>
        <div className="preset-container">
          <label htmlFor="sample-select" className="preset-label">Sample:</label>
          <select
            id="sample-select"
            className="preset-dropdown"
            onChange={(e) => {
              const selected = PRESET_SAMPLES.find((s) => s.id === e.target.value);
              if (selected) onSampleSelected(selected);
            }}
            defaultValue=""
          >
            <option value="" disabled>-- Choose Preset Sample --</option>
            {PRESET_SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.title} ({sample.type.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${loading ? 'loading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xml,.musicxml,.mxl"
          style={{ display: 'none' }}
        />
        <div className="drop-zone-content">
          <FileCode className="w-8 h-8 text-emerald-400 opacity-80" />
          <p className="drop-title">
            {loading ? 'Processing file...' : 'Drop your MusicXML or .MXL file here'}
          </p>
          <p className="drop-subtitle">Supports .xml, .musicxml, and compressed .mxl</p>
        </div>
      </div>

      {activeFileName && (
        <div className="active-file-status">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="file-name-text">Loaded: {activeFileName}</span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
