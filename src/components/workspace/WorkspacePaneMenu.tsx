import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCode2, FileMusic, Piano } from 'lucide-react';
import type { PaneOrientation } from '../../hooks/useWorkspacePanes';

export interface WorkspacePaneMenuProps {
  paneMenuRef: React.RefObject<HTMLDivElement | null>;
  sheetVisible: boolean;
  editorVisible: boolean;
  waterfallVisible: boolean;
  onOpenSheet: () => void;
  onOpenEditor: () => void;
  onOpenWaterfall: () => void;
  paneOrientation: PaneOrientation;
  onLayoutChange: (layout: PaneOrientation) => void;
}

export const WorkspacePaneMenu: React.FC<WorkspacePaneMenuProps> = ({
  paneMenuRef,
  sheetVisible,
  editorVisible,
  waterfallVisible,
  onOpenSheet,
  onOpenEditor,
  onOpenWaterfall,
  paneOrientation,
  onLayoutChange,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.parentElement;
      const menu = paneMenuRef.current;
      if (!anchor || !menu) return;
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
      const rect = anchor.getBoundingClientRect();
      const workspaceBottom = anchor.closest('.score-editor-shell')?.getBoundingClientRect().bottom;
      const bottom = Math.min(window.innerHeight, workspaceBottom && workspaceBottom > 16 ? workspaceBottom : window.innerHeight);
      const width = menu.offsetWidth * zoom;
      const height = Math.min(menu.offsetHeight * zoom, bottom - 16);
      const below = rect.bottom + 4;
      const top = below + height <= bottom - 8 ? below : rect.top - height - 4;
      setPosition({
        position: 'fixed', visibility: 'visible',
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) / zoom,
        top: Math.max(8, Math.min(top, bottom - height - 8)) / zoom,
        maxHeight: (bottom - 16) / zoom, overflowY: 'auto',
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [paneMenuRef]);
  return <><span ref={anchorRef} aria-hidden="true" />{createPortal(
    <div
      ref={paneMenuRef}
      className="workspace-pane-menu"
      style={position}
      role="menu"
      aria-label="Open pane options"
    >
      <div className="workspace-pane-menu-header">Panes</div>
      <button
        type="button"
        role="menuitem"
        className={`workspace-pane-menu-item ${sheetVisible ? 'is-active' : ''}`}
        onClick={onOpenSheet}
      >
        <FileMusic size={15} aria-hidden="true" />
        <span className="pane-menu-title">Sheet</span>
        {sheetVisible ? (
          <span className="pane-menu-badge">Open</span>
        ) : (
          <span className="pane-menu-action">Show</span>
        )}
      </button>
      <button
        type="button"
        role="menuitem"
        className={`workspace-pane-menu-item ${editorVisible ? 'is-active' : ''}`}
        onClick={onOpenEditor}
      >
        <FileCode2 size={15} aria-hidden="true" />
        <span className="pane-menu-title">ABC source</span>
        {editorVisible ? (
          <span className="pane-menu-badge">Open</span>
        ) : (
          <span className="pane-menu-action">Show</span>
        )}
      </button>
      <button
        type="button"
        role="menuitem"
        className={`workspace-pane-menu-item ${waterfallVisible ? 'is-active' : ''}`}
        onClick={onOpenWaterfall}
      >
        <Piano size={15} aria-hidden="true" />
        <span className="pane-menu-title">Waterfall</span>
        <span className={waterfallVisible ? 'pane-menu-badge' : 'pane-menu-action'}>{waterfallVisible ? 'Open' : 'Show'}</span>
      </button>
      <div className="workspace-pane-menu-header pane-layout-heading">Layout</div>
      {([
        ['horizontal', 'Columns'], ['vertical', 'Rows'],
        ['split-left', 'Split stack left'], ['split-right', 'Split stack right'],
      ] as const).map(([layout, label]) => (
        <button key={layout} type="button" role="menuitemradio" aria-checked={paneOrientation === layout}
          className={`workspace-pane-menu-item ${paneOrientation === layout ? 'is-active' : ''}`}
          onClick={() => onLayoutChange(layout)}>
          <span className={`pane-layout-icon layout-icon-${layout}`} aria-hidden="true"><i /><i /><i /></span>
          <span className="pane-menu-title">{label}</span>
        </button>
      ))}
      <div className="pane-layout-hint">Split stacks open all three panes.</div>
    </div>, document.body,
  )}</>;
};
