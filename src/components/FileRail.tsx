import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Braces,
  FileMusic,
  FolderOpen,
  GripVertical,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import type { FileDocument } from '../types/document';

type RailPanel = 'files' | 'tools';
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
  const draggedFileIdRef = useRef<string | null>(null);
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
    draggedFileIdRef.current = null;
    setDraggedFileId(null);
    setDropTarget(null);
  };
  const canReorder = Boolean(onReorderDocument && documents.length > 1);
  const resolveDropPlacement = (
    sourceFileId: string,
    targetFileId: string,
    pointerY?: number,
    targetElement?: HTMLElement,
  ): DropPlacement | null => {
    const sourceIndex = documents.findIndex((document) => document.id === sourceFileId);
    const targetIndex = documents.findIndex((document) => document.id === targetFileId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null;

    if (pointerY !== undefined && targetElement) {
      const bounds = targetElement.getBoundingClientRect();
      if (bounds.height > 0 && pointerY >= bounds.top && pointerY <= bounds.bottom) {
        return pointerY < bounds.top + bounds.height / 2 ? 'before' : 'after';
      }
    }

    return sourceIndex > targetIndex ? 'before' : 'after';
  };
  const resolveDraggedFileId = (event: React.DragEvent<HTMLElement>) => (
    draggedFileIdRef.current
    || event.dataTransfer.getData('application/x-chorale-file-id')
    || event.dataTransfer.getData('text/plain')
  );

  return (
    <aside className={`file-rail ${collapsed ? 'collapsed' : ''}`} aria-label="Workspace panels">
      <nav className="file-rail-tabs" aria-label="Workspace panels">
        <div className="file-rail-tablist" role="tablist" aria-label="Workspace panels">
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
        </div>
        <button
          type="button"
          className="file-rail-tab settings"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
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
            Drag a file handle onto another row to reorder. Use Arrow Up or Arrow Down
            while a handle is focused for keyboard reordering.
          </p>
          <div
            className={`file-list ${draggedFileId ? 'is-dragging' : ''}`}
            onDragOver={(event) => {
              if (event.target !== event.currentTarget || !onReorderDocument) return;
              const sourceFileId = resolveDraggedFileId(event);
              const lastTarget = [...documents].reverse().find((document) => (
                document.id !== sourceFileId
              ));
              if (!sourceFileId || !lastTarget) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget({ fileId: lastTarget.id, placement: 'after' });
            }}
            onDrop={(event) => {
              if (event.target !== event.currentTarget || !onReorderDocument) return;
              event.preventDefault();
              const sourceFileId = resolveDraggedFileId(event);
              const lastTarget = [...documents].reverse().find((document) => (
                document.id !== sourceFileId
              ));
              if (sourceFileId && lastTarget) {
                onReorderDocument(sourceFileId, lastTarget.id, 'after');
              }
              clearDragState();
            }}
          >
            {documents.map((doc, index) => {
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
                  onDragOver={(event) => {
                    const sourceFileId = draggedFileIdRef.current;
                    if (!onReorderDocument || !sourceFileId || sourceFileId === doc.id) return;
                    event.stopPropagation();
                    const placement = resolveDropPlacement(
                      sourceFileId,
                      doc.id,
                      event.clientY,
                      event.currentTarget,
                    );
                    if (!placement) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropTarget({ fileId: doc.id, placement });
                  }}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                    setDropTarget((current) => current?.fileId === doc.id ? null : current);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const sourceFileId = resolveDraggedFileId(event);
                    const placement = resolveDropPlacement(
                      sourceFileId,
                      doc.id,
                      event.clientY,
                      event.currentTarget,
                    );
                    if (onReorderDocument && placement) {
                      onReorderDocument(sourceFileId, doc.id, placement);
                    }
                    clearDragState();
                  }}
                >
                  {canReorder && (
                    <button
                      type="button"
                      className="file-drag-handle"
                      draggable
                      aria-label={`Reorder ${doc.name}`}
                      aria-describedby="file-reorder-help"
                      aria-pressed={draggedFileId === doc.id}
                      title={`Drag ${doc.name} to reorder`}
                      onDragStart={(event) => {
                        draggedFileIdRef.current = doc.id;
                        setDraggedFileId(doc.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('application/x-chorale-file-id', doc.id);
                        event.dataTransfer.setData('text/plain', doc.id);
                        const row = event.currentTarget.closest<HTMLElement>('.file-item');
                        if (row && typeof event.dataTransfer.setDragImage === 'function') {
                          event.dataTransfer.setDragImage(row, 24, 24);
                        }
                      }}
                      onDragEnd={clearDragState}
                      onKeyDown={(event) => {
                        if (!onReorderDocument) return;
                        if (event.key === 'ArrowUp' && index > 0) {
                          event.preventDefault();
                          onReorderDocument(doc.id, documents[index - 1].id, 'before');
                        }
                        if (event.key === 'ArrowDown' && index < documents.length - 1) {
                          event.preventDefault();
                          onReorderDocument(doc.id, documents[index + 1].id, 'after');
                        }
                      }}
                    >
                      <GripVertical size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="file-item-select"
                    onClick={() => onSelectDocument(doc.id)}
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
