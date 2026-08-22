import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  Braces,
  FolderOpen,
  History,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import type { FileDocument } from '../types/document';

type RailPanel = 'files' | 'tools';
type DropPlacement = 'before' | 'after';

const fileOrdersMatch = (first: string[], second: string[]) => (
  first.length === second.length
  && first.every((fileId, index) => fileId === second[index])
);

type SortableTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

const normalizeSortableTransform = (
  transform: SortableTransform | null,
  interfaceZoom: number,
) => {
  if (!transform) return null;
  const scale = Number.isFinite(interfaceZoom) && interfaceZoom > 0 ? interfaceZoom : 1;
  return {
    ...transform,
    x: transform.x / scale,
    y: transform.y / scale,
  };
};

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
  activePanel?: RailPanel;
  onActivePanelChange?: (panel: RailPanel) => void;
  onBeginResize?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  editorVisible?: boolean;
  onToggleEditor?: () => void;
  onOpenSettings?: () => void;
  onOpenHistory?: () => void;
  historyCount?: number;
}

interface FileItemTextProps {
  document: FileDocument;
}

const FileItemText: React.FC<FileItemTextProps> = ({ document }) => {
  const lastReason = document.versions?.[document.versions.length - 1]?.reason;
  const fileState = lastReason === 'manual-edit' ? 'edited' : 'original';

  return (
    <span className="file-item-info">
      <span className="file-item-name">{document.scoreInfo.title || document.name}</span>
      <span className="file-item-meta">
        {document.sourceType === 'mxl'
          ? 'MXL'
          : document.sourceType === 'abc'
            ? 'ABC'
            : 'MusicXML'} · {fileState}
      </span>
    </span>
  );
};

interface SortableFileItemProps {
  document: FileDocument;
  active: boolean;
  index: number;
  documentCount: number;
  canReorder: boolean;
  interfaceZoom: number;
  reducedMotion: boolean;
  onSelectDocument: (fileId: string) => void;
  onDeleteDocument?: (fileId: string) => void;
  onKeyboardReorder: (fileId: string, direction: -1 | 1) => void;
}

const SortableFileItem: React.FC<SortableFileItemProps> = ({
  document,
  active,
  index,
  documentCount,
  canReorder,
  interfaceZoom,
  reducedMotion,
  onSelectDocument,
  onDeleteDocument,
  onKeyboardReorder,
}) => {
  const {
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: document.id,
    disabled: !canReorder,
    transition: reducedMotion
      ? null
      : {
          duration: 180,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        },
  });
  const normalizedTransform = normalizeSortableTransform(transform, interfaceZoom);

  return (
    <div
      ref={setNodeRef}
      data-file-id={document.id}
      className={`file-item ${active ? 'active' : ''} ${canReorder ? 'reorderable' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(normalizedTransform),
        transition,
      }}
      {...listeners}
    >
      <button
        type="button"
        className="file-item-select"
        onClick={() => onSelectDocument(document.id)}
        aria-label={`Open ${document.scoreInfo.title || document.name}`}
        aria-describedby={canReorder ? 'file-reorder-help' : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' && index > 0) {
            event.preventDefault();
            onKeyboardReorder(document.id, -1);
          }
          if (event.key === 'ArrowDown' && index < documentCount - 1) {
            event.preventDefault();
            onKeyboardReorder(document.id, 1);
          }
        }}
      >
        <FileItemText document={document} />
      </button>
      <div className="file-item-actions">
        {onDeleteDocument && (
          <button
            type="button"
            className="file-action-btn delete-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDeleteDocument(document.id)}
            title="Delete file"
            aria-label={`Delete ${document.name}`}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

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
  activePanel: activePanelProp,
  onActivePanelChange,
  onBeginResize,
  editorVisible = false,
  onToggleEditor,
  onOpenSettings,
  onOpenHistory,
  historyCount = 0,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [internalActivePanel, setInternalActivePanel] = useState<RailPanel>('files');
  const activePanel = activePanelProp ?? internalActivePanel;
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [documentOrder, setDocumentOrder] = useState<string[]>(() => (
    documents.map((document) => document.id)
  ));
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const interfaceZoom = typeof window !== 'undefined'
    ? Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'),
      ) || 1
    : 1;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  useEffect(() => {
    const nextOrder = documents.map((document) => document.id);
    setDocumentOrder((currentOrder) => (
      fileOrdersMatch(currentOrder, nextOrder) ? currentOrder : nextOrder
    ));
  }, [documents]);

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

  const activeDragDocument = activeDragId
    ? orderedDocuments.find((document) => document.id === activeDragId)
    : undefined;
  const dropAnimation: DropAnimation | null = reducedMotion
    ? null
    : {
        duration: 180,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      };

  const setActivePanel = (panel: RailPanel) => {
    if (onActivePanelChange) {
      onActivePanelChange(panel);
    } else {
      setInternalActivePanel(panel);
    }
  };

  const handleTabClick = (panel: RailPanel) => {
    if (activePanel === panel) {
      onToggleCollapse?.();
    } else {
      setActivePanel(panel);
      if (collapsed) onToggleCollapse?.();
    }
  };

  const handleToggleExpand = () => {
    // Re-expanding restores the last focused panel tab, which stays tracked
    // (and persisted) even while the rail is collapsed.
    onToggleCollapse?.();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      if (readerEvent.target?.result) {
        onFileLoaded(readerEvent.target.result, file.name);
      }
    };
    if (file.name.endsWith('.mxl')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const commitOrder = (sourceFileId: string, nextOrder: string[]) => {
    const sourceIndex = nextOrder.indexOf(sourceFileId);
    if (!onReorderDocument || sourceIndex === -1) return;

    if (sourceIndex === 0 && nextOrder.length > 1) {
      onReorderDocument(sourceFileId, nextOrder[1], 'before');
    } else if (sourceIndex > 0) {
      onReorderDocument(sourceFileId, nextOrder[sourceIndex - 1], 'after');
    }
  };

  const reorderByIndex = (sourceFileId: string, targetIndex: number) => {
    const sourceIndex = documentOrder.indexOf(sourceFileId);
    if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= documentOrder.length) return;

    const nextOrder = arrayMove(documentOrder, sourceIndex, targetIndex);
    if (fileOrdersMatch(nextOrder, documentOrder)) return;
    setDocumentOrder(nextOrder);
    commitOrder(sourceFileId, nextOrder);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const sourceFileId = String(active.id);
    const targetIndex = documentOrder.indexOf(String(over.id));
    reorderByIndex(sourceFileId, targetIndex);
  };

  const canReorder = Boolean(onReorderDocument && documents.length > 1);

  return (
    <aside className={`file-rail ${collapsed ? 'collapsed' : ''}`} aria-label="Workspace panels">
      <nav className="file-rail-tabs" aria-label="Workspace panels">
        <button
          type="button"
          className="file-rail-tab rail-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={handleToggleExpand}
        >
          {collapsed
            ? <PanelLeft size={18} aria-hidden="true" />
            : <PanelLeftClose size={18} aria-hidden="true" />}
        </button>
        <div className="rail-brand" title="Chorale">
          C
        </div>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragCancel={() => setActiveDragId(null)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={documentOrder}
              strategy={verticalListSortingStrategy}
            >
              <div className={`file-list ${activeDragId ? 'is-dragging' : ''}`}>
                {orderedDocuments.map((document, index) => (
                  <SortableFileItem
                    key={document.id}
                    document={document}
                    active={document.id === activeFileId}
                    index={index}
                    documentCount={orderedDocuments.length}
                    canReorder={canReorder}
                    interfaceZoom={interfaceZoom}
                    reducedMotion={reducedMotion}
                    onSelectDocument={onSelectDocument}
                    onDeleteDocument={onDeleteDocument}
                    onKeyboardReorder={(fileId, direction) => {
                      reorderByIndex(fileId, index + direction);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay
              className="file-drag-overlay-layer"
              dropAnimation={dropAnimation}
              zIndex={400}
            >
              {activeDragDocument ? (
                <div className={`file-item file-item-drag-overlay ${activeDragDocument.id === activeFileId ? 'active' : ''}`}>
                  <div className="file-item-select" aria-hidden="true">
                    <FileItemText document={activeDragDocument} />
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

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
          <button
            type="button"
            className="rail-tool-button history"
            onClick={onOpenHistory}
            title="Open file editing history popup"
            aria-label="Open file editing history popup"
          >
            <History size={16} aria-hidden="true" />
            <span>Editing history</span>
            {historyCount > 0 && (
              <span className="rail-tool-badge" aria-label={`${historyCount} history revisions`}>
                {historyCount}
              </span>
            )}
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
