import React, { useRef } from 'react';
import { FolderOpen, Plus, Clock, Star, FileMusic, AlertCircle } from 'lucide-react';
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
      <button
        type="button"
        className="import-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
      >
        <Plus size={15} />
        <span>Import score</span>
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xml,.musicxml,.mxl,.abc"
        hidden
      />

      <div className="file-rail-section">
        <div className="rail-section-title">LIBRARY</div>
        <nav className="rail-nav">
          <button type="button" className="rail-nav-item">
            <FolderOpen size={16} />
            <span>All projects</span>
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
        <div className="rail-section-title">PROJECTS</div>
        <div className="project-list">
          <button type="button" className="project-item active">
            <span className="project-color coral" />
            <span><strong>Baroque Studies</strong><small>3 scores</small></span>
          </button>
          <button type="button" className="project-item">
            <span className="project-color teal" />
            <span><strong>Jazz Harmony</strong><small>7 scores</small></span>
          </button>
          <button type="button" className="project-item">
            <span className="project-color ochre" />
            <span><strong>Sketchbook</strong><small>12 scores</small></span>
          </button>
        </div>
      </div>

      <div className="file-rail-section">
        <div className="rail-section-title">FILES</div>
        <div className="file-list">
          {documents.map((doc) => {
            const isActive = doc.id === activeFileId;
            const lastReason = doc.versions[doc.versions.length - 1]?.reason;
            const fileState = lastReason === 'manual-edit' ? 'draft' : 'edited';
            return (
              <button
                key={doc.id}
                type="button"
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDocument(doc.id)}
              >
                <span className="file-icon"><FileMusic size={15} /></span>
                <span className="file-item-info">
                  <span className="file-item-name">{doc.scoreInfo.title || doc.name}</span>
                  <span className="file-item-meta">
                    {doc.sourceType === 'mxl' ? 'MXL' : doc.sourceType === 'abc' ? 'ABC' : 'MusicXML'} · {fileState}
                  </span>
                </span>
              </button>
            );
          })}
          {PRESET_SAMPLES
            .filter((sample) => !documents.some((doc) => doc.name.startsWith(sample.title)))
            .slice(0, Math.max(0, 3 - documents.length))
            .map((sample) => (
            <button
              key={sample.id}
              type="button"
              className="file-item"
              onClick={() => onSampleSelected(sample)}
            >
              <span className="file-icon"><FileMusic size={15} /></span>
              <span className="file-item-info">
                <span className="file-item-name">{sample.title}</span>
                <span className="file-item-meta">{sample.type.toUpperCase()} · imported</span>
              </span>
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
