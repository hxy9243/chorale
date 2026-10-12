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
  onClose: () => void;
}

const MENU_ITEM_SELECTOR = 'button[role^="menuitem"]:not(:disabled)';

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
  onClose,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const restoreFocusRef = useRef(false);
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
  useLayoutEffect(() => {
    if (position.visibility !== 'visible') return;
    const launcher = anchorRef.current?.parentElement?.querySelector<HTMLButtonElement>('.workspace-add-tab-btn');
    paneMenuRef.current?.querySelector<HTMLButtonElement>(MENU_ITEM_SELECTOR)?.focus();
    return () => {
      if (!restoreFocusRef.current) return;
      // Opening a pane can replace the launcher. Wait for that commit before restoring focus.
      queueMicrotask(() => {
        const target = launcher?.isConnected ? launcher : document.querySelector<HTMLButtonElement>('.workspace-add-tab-btn');
        target?.focus();
      });
    };
  }, [paneMenuRef, position.visibility]);
  const select = (action: () => void) => {
    restoreFocusRef.current = true;
    action();
    onClose();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      restoreFocusRef.current = true;
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR)];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length
      : current <= 0 ? items.length - 1 : current - 1;
    items[next]?.focus();
  };
  return <><span ref={anchorRef} aria-hidden="true" />{createPortal(
    <div
      ref={paneMenuRef}
      className="workspace-pane-menu"
      style={position}
      role="menu"
      aria-label="Open pane options"
      onKeyDown={handleKeyDown}
    >
      <div className="workspace-pane-menu-header">Panes</div>
      <button
        type="button"
        role="menuitem"
        className={`workspace-pane-menu-item ${sheetVisible ? 'is-active' : ''}`}
        onClick={() => select(onOpenSheet)}
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
        onClick={() => select(onOpenEditor)}
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
        onClick={() => select(onOpenWaterfall)}
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
          onClick={() => select(() => onLayoutChange(layout))}>
          <span className={`pane-layout-icon layout-icon-${layout}`} aria-hidden="true"><i /><i /><i /></span>
          <span className="pane-menu-title">{label}</span>
        </button>
      ))}
      <div className="pane-layout-hint">Split stacks open all three panes.</div>
    </div>, document.body,
  )}</>;
};
