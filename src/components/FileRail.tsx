import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Braces,
  FileMusic,
  FolderOpen,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import type { FileDocument } from '../types/document';

type RailPanel = 'files' | 'tools' | 'settings';
type DropPlacement = 'before' | 'after';

interface FileRailProps {
  documents: FileDocument[];
  activeFileId: string;
  onSelectDocument: (fileId: string) => void;
  onFileLoaded: (fileData: ArrayBuffer | string, fileName: string) => void;
  onDeleteDocument?: (fileId: string) => void;
  onReorderDocument?: (
    sourceFileId: string,
    targetFileId: string,
    placement: DropPlacement,
  ) => void;
  loading?: boolean;
  error?: string | null;
  collapsed?: boolean;
  onBeginResize?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  editorVisible?: boolean;
  onToggleEditor?: () => void;
  onOpenSettings?: () => void;
}

export const FileRail: React.FC<FileRailProps> = ({
  documents,
  activeFileId,
  onSelectDocument,
  onFileLoaded,
  onDeleteDocument,
  onReorderDocument,
  loading = false,
  error = null,
  collapsed = false,
  onBeginResize,
  editorVisible = false,
  onToggleEditor,
  onOpenSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePanel, setActivePanel] = useState<RailPanel>('files');
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    fileId: string;
    placement: DropPlacement;
  } | null>(null);

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

  const clearDragState = () => {
    setDraggedFileId(null);
    setDropTarget(null);
  };
  const canReorder = Boolean(onReorderDocument && documents.length > 1);

  return (
    <aside className={`file-rail ${collapsed ? 'collapsed' : ''}`} aria-label="Workspace panels">
      <nav className="file-rail-tabs" role="tablist" aria-label="Workspace panels">
        <button
          type="button"
          className={`file-rail-tab ${activePanel === 'files' ? 'active' : ''}`}
          role="tab"
          aria-selected={activePanel === 'files'}
          aria-controls="files-panel"
          aria-label="Files"
          title="Files"
          onClick={() => setActivePanel('files')}
        >
          <FolderOpen size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`file-rail-tab ${activePanel === 'tools' ? 'active' : ''}`}
          role="tab"
          aria-selected={activePanel === 'tools'}
          aria-controls="tools-panel"
          aria-label="Tools"
          title="Tools"
          onClick={() => setActivePanel('tools')}
        >
          <Braces size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`file-rail-tab settings ${activePanel === 'settings' ? 'active' : ''}`}
          role="tab"
          aria-selected={activePanel === 'settings'}
          aria-controls="settings-panel"
          aria-label="Settings"
          title="Settings"
          onClick={() => setActivePanel('settings')}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </nav>

      <div className="file-rail-panel-stack">
        <section
          className="file-rail-section"
          id="files-panel"
          role="tabpanel"
          aria-labelledby="files-tab-title"
          hidden={activePanel !== 'files'}
        >
          <div className="rail-section-header">
            <h2 className="rail-section-title" id="files-tab-title">Files</h2>
          </div>
          <button
            type="button"
            className="import-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Import an ABC, MusicXML, or MXL score"
          >
            <Plus size={15} aria-hidden="true" />
            <span>Import score</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xml,.musicxml,.mxl,.abc"
            hidden
          />
          <p className="sr-only" id="file-reorder-help">
            Drag files before or after another file to reorder them.
          </p>
          <div className="file-list">
            {documents.map((doc) => {
              const isActive = doc.id === activeFileId;
              const lastReason = doc.versions?.[doc.versions.length - 1]?.reason;
              const fileState = lastReason === 'manual-edit' ? 'edited' : 'original';
              const dropClass = dropTarget?.fileId === doc.id
                ? `drop-${dropTarget.placement}`
                : '';
              return (
                <div
                  key={doc.id}
                  className={`file-item ${isActive ? 'active' : ''} ${canReorder ? 'reorderable' : ''} ${draggedFileId === doc.id ? 'dragging' : ''} ${dropClass}`}
                  draggable={canReorder}
                  onDragStart={(event) => {
                    if (!onReorderDocument) return;
                    setDraggedFileId(doc.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', doc.id);
                  }}
                  onDragOver={(event) => {
                    if (!onReorderDocument || draggedFileId === doc.id) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const placement = event.clientY < bounds.top + bounds.height / 2
                      ? 'before'
                      : 'after';
                    setDropTarget({ fileId: doc.id, placement });
                  }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceFileId = draggedFileId || event.dataTransfer.getData('text/plain');
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const placement = event.clientY < bounds.top + bounds.height / 2
                    ? 'before'
                    : 'after';
                  if (onReorderDocument && sourceFileId && sourceFileId !== doc.id) {
                    onReorderDocument(
                      sourceFileId,
                      doc.id,
                      placement,
                    );
                  }
                    clearDragState();
                  }}
                  onDragEnd={clearDragState}
                  title={canReorder ? `Drag ${doc.name} to reorder` : undefined}
                >
                  <button
                    type="button"
                    className="file-item-select"
                    onClick={() => onSelectDocument(doc.id)}
                    aria-describedby="file-reorder-help"
                    aria-label={`Open ${doc.scoreInfo.title || doc.name}`}
                  >
                    <span className="file-icon"><FileMusic size={16} aria-hidden="true" /></span>
                    <span className="file-item-info">
                      <span className="file-item-name">{doc.scoreInfo.title || doc.name}</span>
                      <span className="file-item-meta">
                        {doc.sourceType === 'mxl' ? 'MXL' : doc.sourceType === 'abc' ? 'ABC' : 'MusicXML'} · {fileState}
                      </span>
                    </span>
                  </button>
                  <div className="file-item-actions">
                    {onDeleteDocument && (
                      <button
                        type="button"
                        className="file-action-btn delete-btn"
                        onClick={() => onDeleteDocument(doc.id)}
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

          {error && (
            <div className="file-rail-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </section>

        <section
          className="file-rail-section"
          id="tools-panel"
          role="tabpanel"
          aria-labelledby="tools-tab-title"
          hidden={activePanel !== 'tools'}
        >
          <div className="rail-section-header">
            <h2 className="rail-section-title" id="tools-tab-title">Tools</h2>
          </div>
          <button
            type="button"
            className={`rail-tool-button ${editorVisible ? 'active' : ''}`}
            onClick={onToggleEditor}
            aria-pressed={editorVisible}
            title={editorVisible ? 'Close the ABC source panel' : 'Open the ABC source panel'}
          >
            <Braces size={16} aria-hidden="true" />
            <span>ABC display</span>
          </button>
        </section>

        <section
          className="file-rail-section"
          id="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-title"
          hidden={activePanel !== 'settings'}
        >
          <div className="rail-section-header">
            <h2 className="rail-section-title" id="settings-tab-title">Settings</h2>
          </div>
          <button
            type="button"
            className="rail-tool-button"
            onClick={onOpenSettings}
            title="Open application settings"
            aria-label="Open settings"
          >
            <Settings size={16} aria-hidden="true" />
            <span>Application settings</span>
          </button>
        </section>
      </div>

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
