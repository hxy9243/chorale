import React, { useEffect, useMemo, useRef, useState } from 'react';
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

type RailPanel = 'files' | 'tools';
type DropPlacement = 'before' | 'after';
type NativeDragGeometry = {
  grabOffsetY: number;
  rowHeight: number;
};
type PendingPointerGesture = {
  sourceFileId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

const reorderFileIds = (
  fileIds: string[],
  sourceFileId: string,
  targetFileId: string,
  placement: DropPlacement,
) => {
  const sourceIndex = fileIds.indexOf(sourceFileId);
  const targetIndex = fileIds.indexOf(targetFileId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return fileIds;
  }

  const nextOrder = [...fileIds];
  const [movedFileId] = nextOrder.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextOrder.indexOf(targetFileId);
  const insertionIndex = placement === 'after'
    ? adjustedTargetIndex + 1
    : adjustedTargetIndex;
  nextOrder.splice(insertionIndex, 0, movedFileId);
  return nextOrder;
};

const fileOrdersMatch = (first: string[], second: string[]) => (
  first.length === second.length
  && first.every((fileId, index) => fileId === second[index])
);

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
  onToggleCollapse?: () => void;
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
  onToggleCollapse,
  onBeginResize,
  editorVisible = false,
  onToggleEditor,
  onOpenSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const draggedFileIdRef = useRef<string | null>(null);
  const dragImageRef = useRef<HTMLElement | null>(null);
  const cancelHideDragSourceRef = useRef<(() => void) | null>(null);
  const initialDragOrderRef = useRef<string[] | null>(null);
  const nativeDragGeometryRef = useRef<NativeDragGeometry | null>(null);
  const pendingPointerGestureRef = useRef<PendingPointerGesture | null>(null);
  const dropCommittedRef = useRef(false);
  const dragCancelledRef = useRef(false);
  const [activePanel, setActivePanel] = useState<RailPanel>('files');
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [hiddenDraggedFileId, setHiddenDraggedFileId] = useState<string | null>(null);

  const handleTabClick = (panel: RailPanel) => {
    if (activePanel === panel) {
      onToggleCollapse?.();
    } else {
      setActivePanel(panel);
      if (collapsed) {
        onToggleCollapse?.();
      }
    }
  };
  const [documentOrder, setDocumentOrder] = useState<string[]>(() => (
    documents.map((document) => document.id)
  ));
  const documentOrderRef = useRef(documentOrder);

  useEffect(() => {
    const nextOrder = documents.map((document) => document.id);
    documentOrderRef.current = nextOrder;
    setDocumentOrder(nextOrder);
  }, [documents]);

  useEffect(() => () => {
    cancelHideDragSourceRef.current?.();
    dragImageRef.current?.remove();
  }, []);

  useEffect(() => {
    if (!draggedFileId) return undefined;
    const markEscapeCancellation = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dragCancelledRef.current = true;
    };
    window.addEventListener('keydown', markEscapeCancellation, true);
    return () => window.removeEventListener('keydown', markEscapeCancellation, true);
  }, [draggedFileId]);

  const orderedDocuments = useMemo(() => {
    const documentsById = new Map(documents.map((document) => [document.id, document]));
    const ordered = documentOrder
      .map((fileId) => documentsById.get(fileId))
      .filter((document): document is FileDocument => Boolean(document));
    const orderedIds = new Set(documentOrder);
    return [
      ...ordered,
      ...documents.filter((document) => !orderedIds.has(document.id)),
    ];
  }, [documentOrder, documents]);

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

  const updateDocumentOrder = (nextOrder: string[]) => {
    documentOrderRef.current = nextOrder;
    setDocumentOrder(nextOrder);
  };
  const clearDragArtifacts = () => {
    cancelHideDragSourceRef.current?.();
    cancelHideDragSourceRef.current = null;
    dragImageRef.current?.remove();
    dragImageRef.current = null;
    draggedFileIdRef.current = null;
    setDraggedFileId(null);
    setHiddenDraggedFileId(null);
  };
  const canReorder = Boolean(onReorderDocument && documents.length > 1);
  const orderForPointer = (
    sourceFileId: string,
    pointerY: number,
  ) => {
    const geometry = nativeDragGeometryRef.current;
    const fileList = fileListRef.current;
    if (!geometry || !fileList || !Number.isFinite(pointerY)) return documentOrderRef.current;

    const draggedCenterY = pointerY - geometry.grabOffsetY + geometry.rowHeight / 2;
    const otherRows = [...fileList.querySelectorAll<HTMLElement>('.file-item')]
      .filter((row) => row.dataset.fileId && row.dataset.fileId !== sourceFileId);
    const otherFileIds = otherRows.map((row) => row.dataset.fileId as string);
    const insertionIndex = otherRows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return bounds.height > 0 && draggedCenterY < bounds.top + bounds.height / 2;
    });
    const nextOrder = [...otherFileIds];
    nextOrder.splice(insertionIndex === -1 ? nextOrder.length : insertionIndex, 0, sourceFileId);
    return nextOrder.length === documentOrderRef.current.length
      ? nextOrder
      : documentOrderRef.current;
  };
  const resolveDraggedFileId = (event: React.DragEvent<HTMLElement>) => (
    draggedFileIdRef.current
    || event.dataTransfer.getData('application/x-chorale-file-id')
    || event.dataTransfer.getData('text/plain')
  );
  const previewDrop = (
    sourceFileId: string,
    targetFileId: string,
    placement: DropPlacement,
  ) => {
    const nextOrder = reorderFileIds(
      documentOrderRef.current,
      sourceFileId,
      targetFileId,
      placement,
    );
    if (!fileOrdersMatch(nextOrder, documentOrderRef.current)) {
      updateDocumentOrder(nextOrder);
    }
    return nextOrder;
  };
  const previewPointerPosition = (sourceFileId: string, pointerY: number) => {
    const nextOrder = orderForPointer(sourceFileId, pointerY);
    if (!fileOrdersMatch(nextOrder, documentOrderRef.current)) {
      updateDocumentOrder(nextOrder);
    }
    return nextOrder;
  };
  const commitKeyboardDrop = (
    sourceFileId: string,
    targetFileId: string,
    placement: DropPlacement,
  ) => {
    if (!onReorderDocument) return;
    previewDrop(sourceFileId, targetFileId, placement);
    onReorderDocument(sourceFileId, targetFileId, placement);
  };
  const commitPreviewedDrop = (sourceFileId: string) => {
    const finalOrder = documentOrderRef.current;
    const initialOrder = initialDragOrderRef.current;
    const sourceIndex = finalOrder.indexOf(sourceFileId);
    if (
      onReorderDocument
      && initialOrder
      && !fileOrdersMatch(finalOrder, initialOrder)
      && sourceIndex !== -1
    ) {
      if (sourceIndex === 0 && finalOrder.length > 1) {
        onReorderDocument(sourceFileId, finalOrder[1], 'before');
      } else if (sourceIndex > 0) {
        onReorderDocument(sourceFileId, finalOrder[sourceIndex - 1], 'after');
      }
    }
    dropCommittedRef.current = true;
    clearDragArtifacts();
  };
  useEffect(() => {
    const resetPendingPointerGesture = () => {
      pendingPointerGestureRef.current = null;
      if (!draggedFileIdRef.current) {
        initialDragOrderRef.current = null;
        nativeDragGeometryRef.current = null;
      }
    };
    const finishPendingPointerGesture = (event: PointerEvent) => {
      const pendingGesture = pendingPointerGestureRef.current;
      if (!pendingGesture || event.pointerId !== pendingGesture.pointerId) return;
      pendingPointerGestureRef.current = null;

      // Native drag suppresses pointerup once dragstart succeeds. If Chromium
      // releases before dragstart, use the completed pointer gesture as the
      // missing drop so a fast swipe cannot snap back to its starting slot.
      if (draggedFileIdRef.current) return;
      const fileListBounds = fileListRef.current?.getBoundingClientRect();
      const movement = Math.hypot(
        event.clientX - pendingGesture.startX,
        event.clientY - pendingGesture.startY,
      );
      const releasedInsideFileList = Boolean(
        fileListBounds
        && event.clientX >= fileListBounds.left
        && event.clientX <= fileListBounds.right
        && event.clientY >= fileListBounds.top
        && event.clientY <= fileListBounds.bottom
      );
      if (movement < 5 || !releasedInsideFileList) {
        resetPendingPointerGesture();
        return;
      }

      previewPointerPosition(pendingGesture.sourceFileId, event.clientY);
      commitPreviewedDrop(pendingGesture.sourceFileId);
      initialDragOrderRef.current = null;
      nativeDragGeometryRef.current = null;
      dropCommittedRef.current = false;
      dragCancelledRef.current = false;
    };

    window.addEventListener('pointerup', finishPendingPointerGesture, true);
    window.addEventListener('pointercancel', resetPendingPointerGesture, true);
    return () => {
      window.removeEventListener('pointerup', finishPendingPointerGesture, true);
      window.removeEventListener('pointercancel', resetPendingPointerGesture, true);
    };
  });
  const endNativeDrag = (event: React.DragEvent<HTMLDivElement>) => {
    const sourceFileId = draggedFileIdRef.current;
    if (dragCancelledRef.current && initialDragOrderRef.current) {
      updateDocumentOrder(initialDragOrderRef.current);
    } else if (!dropCommittedRef.current && sourceFileId) {
      const fileListBounds = fileListRef.current?.getBoundingClientRect();
      if (
        fileListBounds
        && event.clientY >= fileListBounds.top
        && event.clientY <= fileListBounds.bottom
      ) {
        previewPointerPosition(sourceFileId, event.clientY);
      }
      commitPreviewedDrop(sourceFileId);
    } else {
      clearDragArtifacts();
    }
    initialDragOrderRef.current = null;
    nativeDragGeometryRef.current = null;
    dropCommittedRef.current = false;
    dragCancelledRef.current = false;
  };
  const beginNativeDrag = (
    event: React.DragEvent<HTMLDivElement>,
    fileId: string,
  ) => {
    pendingPointerGestureRef.current = null;
    initialDragOrderRef.current = [...documentOrderRef.current];
    dropCommittedRef.current = false;
    dragCancelledRef.current = false;
    draggedFileIdRef.current = fileId;
    setDraggedFileId(fileId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-chorale-file-id', fileId);
    event.dataTransfer.setData('text/plain', fileId);

    const row = event.currentTarget;
    const bounds = row.getBoundingClientRect();
    const rowHeight = bounds.height > 0 ? bounds.height : 64;
    const pointerIsWithinRow = bounds.height > 0
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
    const grabOffsetY = pointerIsWithinRow
      ? Math.max(0, Math.min(rowHeight, event.clientY - bounds.top))
      : rowHeight / 2;
    nativeDragGeometryRef.current = {
      grabOffsetY,
      rowHeight,
    };
    if (typeof event.dataTransfer.setDragImage === 'function') {
      const dragImage = row.cloneNode(true) as HTMLElement;
      dragImage.classList.remove('dragging', 'drag-source-hidden', 'drop-before', 'drop-after');
      dragImage.classList.add('file-item-drag-image');
      dragImage.removeAttribute('draggable');
      dragImage.setAttribute('aria-hidden', 'true');
      dragImage.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      dragImage.querySelectorAll<HTMLElement>('button, [tabindex]').forEach((element) => {
        element.tabIndex = -1;
      });
      if (bounds.width > 0) {
        dragImage.style.setProperty('--file-drag-image-width', `${bounds.width}px`);
      }
      document.body.appendChild(dragImage);
      dragImageRef.current = dragImage;

      const offsetX = bounds.width > 0
        ? Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
        : 24;
      event.dataTransfer.setDragImage(dragImage, offsetX, grabOffsetY);
    }

    const hideDragSource = () => {
      setHiddenDraggedFileId(fileId);
      cancelHideDragSourceRef.current = null;
    };
    if (typeof window.requestAnimationFrame === 'function') {
      const frameId = window.requestAnimationFrame(hideDragSource);
      cancelHideDragSourceRef.current = () => window.cancelAnimationFrame(frameId);
    } else {
      const timeoutId = window.setTimeout(hideDragSource, 0);
      cancelHideDragSourceRef.current = () => window.clearTimeout(timeoutId);
    }
  };

  return (
    <aside className={`file-rail ${collapsed ? 'collapsed' : ''}`} aria-label="Workspace panels">
      <nav className="file-rail-tabs" aria-label="Workspace panels">
        <div className="file-rail-tablist" role="tablist" aria-label="Workspace panels">
          <button
            type="button"
            className={`file-rail-tab ${!collapsed && activePanel === 'files' ? 'active' : ''}`}
            role="tab"
            aria-selected={!collapsed && activePanel === 'files'}
            aria-controls="files-panel"
            aria-label="Files"
            title="Files"
            onClick={() => handleTabClick('files')}
          >
            <FolderOpen size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`file-rail-tab ${!collapsed && activePanel === 'tools' ? 'active' : ''}`}
            role="tab"
            aria-selected={!collapsed && activePanel === 'tools'}
            aria-controls="tools-panel"
            aria-label="Tools"
            title="Tools"
            onClick={() => handleTabClick('tools')}
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

      <div className="file-rail-panel-stack" hidden={collapsed}>
        <section
          className="file-rail-section"
          id="files-panel"
          role="tabpanel"
          aria-labelledby="files-tab-title"
          hidden={collapsed || activePanel !== 'files'}
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
            Drag a file row to reorder. Use Arrow Up or Arrow Down while its file
            name is focused for keyboard reordering.
          </p>
          <div
            ref={fileListRef}
            className={`file-list ${draggedFileId ? 'is-dragging' : ''}`}
            onDragOver={(event) => {
              if (!onReorderDocument) return;
              const sourceFileId = resolveDraggedFileId(event);
              if (!sourceFileId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              previewPointerPosition(sourceFileId, event.clientY);
            }}
            onDrop={(event) => {
              if (!onReorderDocument) return;
              event.preventDefault();
              const sourceFileId = resolveDraggedFileId(event);
              if (sourceFileId) {
                previewPointerPosition(sourceFileId, event.clientY);
                commitPreviewedDrop(sourceFileId);
              }
            }}
          >
            {orderedDocuments.map((doc, index) => {
              const isActive = doc.id === activeFileId;
              const lastReason = doc.versions?.[doc.versions.length - 1]?.reason;
              const fileState = lastReason === 'manual-edit' ? 'edited' : 'original';
              return (
                <div
                  key={doc.id}
                  data-file-id={doc.id}
                  className={`file-item ${isActive ? 'active' : ''} ${canReorder ? 'reorderable' : ''} ${draggedFileId === doc.id ? 'dragging' : ''} ${hiddenDraggedFileId === doc.id ? 'drag-source-placeholder' : ''}`}
                  draggable={canReorder}
                  onPointerDown={(event) => {
                    if (!canReorder || event.button !== 0) return;
                    const target = event.target;
                    if (target instanceof Element && target.closest('.file-action-btn')) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const rowHeight = bounds.height > 0 ? bounds.height : 64;
                    nativeDragGeometryRef.current = {
                      grabOffsetY: bounds.height > 0
                        ? Math.max(0, Math.min(rowHeight, event.clientY - bounds.top))
                        : rowHeight / 2,
                      rowHeight,
                    };
                    initialDragOrderRef.current = [...documentOrderRef.current];
                    pendingPointerGestureRef.current = {
                      sourceFileId: doc.id,
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                    };
                  }}
                  onDragStart={(event) => beginNativeDrag(event, doc.id)}
                  onDragEnd={endNativeDrag}
                >
                  <button
                    type="button"
                    className="file-item-select"
                    onClick={() => onSelectDocument(doc.id)}
                    aria-label={`Open ${doc.scoreInfo.title || doc.name}`}
                    aria-describedby={canReorder ? 'file-reorder-help' : undefined}
                    onKeyDown={(event) => {
                      if (!onReorderDocument) return;
                      if (event.key === 'ArrowUp' && index > 0) {
                        event.preventDefault();
                        commitKeyboardDrop(doc.id, orderedDocuments[index - 1].id, 'before');
                      }
                      if (event.key === 'ArrowDown' && index < orderedDocuments.length - 1) {
                        event.preventDefault();
                        commitKeyboardDrop(doc.id, orderedDocuments[index + 1].id, 'after');
                      }
                    }}
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
          hidden={collapsed || activePanel !== 'tools'}
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

      {onBeginResize && !collapsed && (
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
