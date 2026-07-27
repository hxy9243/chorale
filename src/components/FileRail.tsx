import React, { useRef } from 'react';
import { Plus, FileMusic, AlertCircle, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { FileDocument } from '../types/document';
import type { MusicSample } from '../types/music';
import { PRESET_SAMPLES } from '../data/samples';

interface FileRailProps {
  documents: FileDocument[];
  activeFileId: string;
  onSelectDocument: (fileId: string) => void;
  onSampleSelected: (sample: MusicSample) => void;
  onFileLoaded: (fileData: ArrayBuffer | string, fileName: string) => void;
  onDeleteDocument?: (fileId: string) => void;
  onMoveDocument?: (fileId: string, direction: 'up' | 'down') => void;
  loading?: boolean;
  error?: string | null;
}

export const FileRail: React.FC<FileRailProps> = ({
  documents,
  activeFileId,
  onSelectDocument,
  onSampleSelected,
  onFileLoaded,
  onDeleteDocument,
  onMoveDocument,
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
    <aside className="file-rail" aria-label="Files">
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
        <div className="rail-section-title">FILES</div>
        <div className="file-list">
          {documents.map((doc, index) => {
            const isActive = doc.id === activeFileId;
            const lastReason = doc.versions[doc.versions.length - 1]?.reason;
            const fileState = lastReason === 'manual-edit' ? 'draft' : 'edited';
            return (
              <div
                key={doc.id}
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDocument(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectDocument(doc.id);
                  }
                }}
              >
                <span className="file-icon"><FileMusic size={15} /></span>
                <span className="file-item-info">
                  <span className="file-item-name">{doc.scoreInfo.title || doc.name}</span>
                  <span className="file-item-meta">
                    {doc.sourceType === 'mxl' ? 'MXL' : doc.sourceType === 'abc' ? 'ABC' : 'MusicXML'} · {fileState}
                  </span>
                </span>
                <div className="file-item-actions" onClick={(e) => e.stopPropagation()}>
                  {onMoveDocument && (
                    <>
                      <button
                        type="button"
                        className="file-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveDocument(doc.id, 'up');
                        }}
                        disabled={index === 0}
                        title="Move file up"
                        aria-label={`Move ${doc.name} up`}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="file-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveDocument(doc.id, 'down');
                        }}
                        disabled={index === documents.length - 1}
                        title="Move file down"
                        aria-label={`Move ${doc.name} down`}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </>
                  )}
                  {onDeleteDocument && (
                    <button
                      type="button"
                      className="file-action-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      title="Delete file"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
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
