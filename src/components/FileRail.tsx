import React, { useRef } from 'react';
import { FolderOpen, Plus, Clock, Star, FileMusic, CheckCircle2, AlertCircle } from 'lucide-react';
import type { FileDocument } from '../types/document';
import type { MusicSample } from '../types/music';
import { PRESET_SAMPLES } from '../data/samples';

interface FileRailProps {
  documents: FileDocument[];
  activeFileId: string;
  onSelectDocument: (fileId: string) => void;
  onSampleSelected: (sample: MusicSample) => void;
  onFileLoaded: (fileData: ArrayBuffer | string, fileName: string) => void;
  loading?: boolean;
  error?: string | null;
}

export const FileRail: React.FC<FileRailProps> = ({
  documents,
  activeFileId,
  onSelectDocument,
  onSampleSelected,
  onFileLoaded,
  loading = false,
  error = null,
}) => {
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

  return (
    <aside className="file-rail" aria-label="Project and File Navigation">
      <div className="file-rail-header">
        <button
          type="button"
          className="btn btn-primary import-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <Plus size={16} />
          <span>Import Score</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xml,.musicxml,.mxl,.abc"
          style={{ display: 'none' }}
        />
      </div>

      <div className="file-rail-section">
        <div className="rail-section-title">LIBRARY</div>
        <nav className="rail-nav">
          <button type="button" className="rail-nav-item active">
            <FolderOpen size={16} />
            <span>All Scores</span>
          </button>
          <button type="button" className="rail-nav-item">
            <Clock size={16} />
            <span>Recent</span>
          </button>
          <button type="button" className="rail-nav-item">
            <Star size={16} />
            <span>Favorites</span>
          </button>
        </nav>
      </div>

      <div className="file-rail-section">
        <div className="rail-section-title">
          <span>ACTIVE FILES</span>
          <span className="rail-count">{documents.length}</span>
        </div>

        <div className="file-list">
          {documents.map((doc) => {
            const isActive = doc.id === activeFileId;
            const lastReason = doc.versions[doc.versions.length - 1]?.reason;
            const fileState = lastReason === 'manual-edit' ? 'Draft' : 'Imported';
            return (
              <button
                key={doc.id}
                type="button"
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDocument(doc.id)}
              >
                <FileMusic size={16} className="file-item-icon" />
                <div className="file-item-info">
                  <span className="file-item-name">{doc.name}</span>
                  <span className="file-item-meta">
                    {doc.sourceType.toUpperCase()} &bull; {fileState} &bull; r{doc.revision}
                  </span>
                </div>
                {isActive && <CheckCircle2 size={14} className="active-indicator" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="file-rail-section">
        <div className="rail-section-title">
          <span>PRESET SAMPLES</span>
          <span className="rail-count">{PRESET_SAMPLES.length}</span>
        </div>

        <div className="file-list">
          {PRESET_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              className="file-item sample-item"
              onClick={() => onSampleSelected(sample)}
            >
              <FileMusic size={16} className="file-item-icon" />
              <div className="file-item-info">
                <span className="file-item-name">{sample.title}</span>
                <span className="file-item-meta">{sample.type.toUpperCase()} SAMPLE</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="file-rail-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </aside>
  );
};

export default FileRail;
