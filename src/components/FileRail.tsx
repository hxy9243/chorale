import React, { useRef } from 'react';
import { Plus, FileMusic, AlertCircle, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { FileDocument } from '../types/document';

interface FileRailProps {
  documents: FileDocument[];
  activeFileId: string;
  onSelectDocument: (fileId: string) => void;
  onFileLoaded: (fileData: ArrayBuffer | string, fileName: string) => void;
  onDeleteDocument?: (fileId: string) => void;
  onMoveDocument?: (fileId: string, direction: 'up' | 'down') => void;
  loading?: boolean;
  error?: string | null;
  collapsed?: boolean;
  onBeginResize?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export const FileRail: React.FC<FileRailProps> = ({
  documents,
  activeFileId,
  onSelectDocument,
  onFileLoaded,
  onDeleteDocument,
  onMoveDocument,
  loading = false,
  error = null,
  collapsed = false,
  onBeginResize,
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
    <aside className={`file-rail ${collapsed ? 'collapsed' : ''}`} aria-label="Files">
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
        <div className="rail-section-header">
          <p className="rail-section-title">FILES</p>
        </div>
        <div className="file-list">
          {documents.map((doc, index) => {
            const isActive = doc.id === activeFileId;
            const lastReason = doc.versions?.[doc.versions.length - 1]?.reason;
            const fileState = lastReason === 'manual-edit' ? 'edited' : 'original';
            return (
              <div
                key={doc.id}
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDocument(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDocument(doc.id);
                  }
                }}
              >
                <div className="file-icon"><FileMusic size={16} /></div>
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
                      disabled={documents.length <= 1}
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
        </div>
      </div>

      {error && (
        <div className="file-rail-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {onBeginResize && (
        <button
          type="button"
          className="file-rail-resize-handle"
          onPointerDown={onBeginResize}
          title="Drag to resize sidebar width"
          aria-label="Resize sidebar"
        />
      )}
    </aside>
  );
};

export default FileRail;
