import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronRight,
  Copy,
  Download,
  FileMusic,
  FileText,
  FolderOpen,
  History,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import type { FileDocument } from '../types/document';
import { DeleteFileConfirmModal } from './DeleteFileConfirmModal';

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

interface ContextMenuState {
  fileId: string;
  x: number;
  y: number;
}

interface FileRailProps {
  documents: FileDocument[];
  activeFileId: string;
  onSelectDocument: (fileId: string) => void;
  onFileLoaded: (fileData: ArrayBuffer | string, fileName: string) => void;
  onNewScore?: () => void;
  onDeleteDocument?: (fileId: string) => void;
  onDuplicateDocument?: (fileId: string) => void;
  onExportDocument?: (fileId: string, format: 'musicxml') => void;
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
  onContextMenu: (fileId: string, point: { clientX: number; clientY: number }) => void;
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
  onContextMenu,
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

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(document.id, { clientX: event.clientX, clientY: event.clientY });
  };

  const handleSelectKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onKeyboardReorder(document.id, -1);
    }
    if (event.key === 'ArrowDown' && index < documentCount - 1) {
      event.preventDefault();
      onKeyboardReorder(document.id, 1);
    }
    if (event.key === 'ContextMenu') {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(document.id, { clientX: rect.left, clientY: rect.bottom });
    }
  };

  return (
    <div
      ref={setNodeRef}
      data-file-id={document.id}
      className={`file-item ${active ? 'active' : ''} ${canReorder ? 'reorderable' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(normalizedTransform),
        transition,
      }}
      onContextMenu={handleContextMenu}
      {...listeners}
    >
      <button
        type="button"
        className="file-item-select"
        onClick={() => onSelectDocument(document.id)}
        aria-label={`Open ${document.scoreInfo.title || document.name}`}
        aria-describedby={canReorder ? 'file-reorder-help' : undefined}
        onKeyDown={handleSelectKeyDown}
      >
        <FileItemText document={document} />
      </button>
    </div>
  );
};

interface FileItemContextMenuProps {
  fileId: string;
  x: number;
  y: number;
  interfaceZoom: number;
  documents: FileDocument[];
  activeFileId: string;
  onOpen: () => void;
  onDuplicate: () => void;
  onExport: (format: 'musicxml') => void;
  onDelete: () => void;
  onClose: () => void;
}

const CONTEXT_MENU_WIDTH = 208;
const CONTEXT_MENU_HEIGHT_ESTIMATE = 208;

const FileItemContextMenu: React.FC<FileItemContextMenuProps> = ({
  fileId,
  x,
  y,
  interfaceZoom,
  documents,
  activeFileId,
  onOpen,
  onDuplicate,
  onExport,
  onDelete,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const document = documents.find((doc) => doc.id === fileId);
  const isActive = fileId === activeFileId;

  useEffect(() => {
    if (!menuRef.current) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  if (!document) return null;

  // Pointer coordinates are screen-space pixels, but the menu is rendered inside
  // the body's interface zoom, which multiplies its fixed-position coordinates.
  const uiZoom = Number.isFinite(interfaceZoom) && interfaceZoom > 0 ? interfaceZoom : 1;
  const viewportWidth = window.innerWidth / uiZoom;
  const viewportHeight = window.innerHeight / uiZoom;
  const left = Math.max(8, Math.min(x / uiZoom, viewportWidth - CONTEXT_MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(y / uiZoom, viewportHeight - CONTEXT_MENU_HEIGHT_ESTIMATE - 8));

  return (
    <div
      ref={menuRef}
      className="file-context-menu"
      style={{ left, top }}
      role="menu"
      aria-label={`Actions for ${document.scoreInfo.title || document.name}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="file-context-menu-heading">
        <span className="file-context-menu-title" title={document.scoreInfo.title || document.name}>
          {document.scoreInfo.title || document.name}
        </span>
      </div>
      <button
        type="button"
        role="menuitem"
        className="file-context-menu-item"
        onClick={() => {
          onOpen();
          onClose();
        }}
        disabled={isActive}
        title={isActive ? 'This file is already open' : undefined}
      >
        <FolderOpen size={15} aria-hidden="true" />
        <span>Open</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="file-context-menu-item"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        <Copy size={15} aria-hidden="true" />
        <span>Duplicate</span>
      </button>
      <div
        className="file-context-menu-group"
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={submenuOpen}
          className="file-context-menu-item file-context-menu-export"
          onClick={() => setSubmenuOpen((open) => !open)}
        >
          <Download size={15} aria-hidden="true" />
          <span>Export</span>
          <ChevronRight size={13} aria-hidden="true" className="file-context-menu-chevron" />
        </button>
        {submenuOpen && (
          <div className="file-context-menu-submenu" role="menu" aria-label="Export options">
            <button
              type="button"
              role="menuitem"
              className="file-context-menu-item"
              onClick={() => {
                setSubmenuOpen(false);
                onExport('musicxml');
                onClose();
              }}
            >
              <FileMusic size={15} aria-hidden="true" />
              <span>MusicXML (.musicxml)</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-context-menu-item"
              disabled
              title="Coming soon"
            >
              <FileText size={15} aria-hidden="true" />
              <span>PDF (coming soon)</span>
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        role="menuitem"
        className="file-context-menu-item danger"
        onClick={() => {
          onDelete();
        }}
      >
        <Trash2 size={15} aria-hidden="true" />
        <span>Delete</span>
      </button>
    </div>
  );
};

export const FileRail: React.FC<FileRailProps> = ({
  documents,
  activeFileId,
  onSelectDocument,
  onFileLoaded,
  onNewScore,
  onDeleteDocument,
  onDuplicateDocument,
  onExportDocument,
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileDocument | null>(null);
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
    setContextMenu(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const sourceFileId = String(active.id);
    const targetIndex = documentOrder.indexOf(String(over.id));
    reorderByIndex(sourceFileId, targetIndex);
  };

  const openContextMenu = (fileId: string, point: { clientX: number; clientY: number }) => {
    setContextMenu({ fileId, x: point.clientX, y: point.clientY });
  };

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContextOpen = () => {
    if (!contextMenu) return;
    const fileId = contextMenu.fileId;
    if (fileId !== activeFileId) {
      onSelectDocument(fileId);
    }
  };

  const handleContextDuplicate = () => {
    if (contextMenu && onDuplicateDocument) {
      onDuplicateDocument(contextMenu.fileId);
    }
  };

  const handleContextExport = (format: 'musicxml') => {
    if (!contextMenu) return;
    const fileId = contextMenu.fileId;
    if (onExportDocument) {
      onExportDocument(fileId, format);
    }
    setContextMenu(null);
  };

  const handleContextDelete = () => {
    if (!contextMenu) return;
    const target = documents.find((doc) => doc.id === contextMenu.fileId);
    if (target) {
      setDeleteTarget(target);
    }
    setContextMenu(null);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget && onDeleteDocument) {
      onDeleteDocument(deleteTarget.id);
    }
    setDeleteTarget(null);
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
          <div className="file-create-actions">
            <button
              type="button"
              className="import-btn"
              onClick={onNewScore}
              disabled={loading}
              title="Create a blank piano score"
            >
              <Plus size={15} aria-hidden="true" />
              <span>New Score</span>
            </button>
            <button
              type="button"
              className="import-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Import an ABC, MusicXML, or MXL score"
            >
              <FileMusic size={15} aria-hidden="true" />
              <span>Import score</span>
            </button>
          </div>
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
                    onContextMenu={openContextMenu}
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

      {contextMenu && (
        <FileItemContextMenu
          fileId={contextMenu.fileId}
          x={contextMenu.x}
          y={contextMenu.y}
          interfaceZoom={interfaceZoom}
          documents={documents}
          activeFileId={activeFileId}
          onOpen={handleContextOpen}
          onDuplicate={handleContextDuplicate}
          onExport={handleContextExport}
          onDelete={handleContextDelete}
          onClose={closeContextMenu}
        />
      )}

      <DeleteFileConfirmModal
        open={Boolean(deleteTarget)}
        fileTitle={deleteTarget?.scoreInfo.title || deleteTarget?.name || ''}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </aside>
  );
};

export default FileRail;
