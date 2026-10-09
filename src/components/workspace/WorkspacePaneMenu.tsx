import React from 'react';
import { FileCode2, FileMusic, Piano } from 'lucide-react';

export interface WorkspacePaneMenuProps {
  paneMenuRef: React.RefObject<HTMLDivElement | null>;
  sheetVisible: boolean;
  editorVisible: boolean;
  waterfallVisible: boolean;
  onOpenSheet: () => void;
  onOpenEditor: () => void;
  onOpenWaterfall: () => void;
}

export const WorkspacePaneMenu: React.FC<WorkspacePaneMenuProps> = ({
  paneMenuRef,
  sheetVisible,
  editorVisible,
  waterfallVisible,
  onOpenSheet,
  onOpenEditor,
  onOpenWaterfall,
}) => {
  return (
    <div
      ref={paneMenuRef}
      className="workspace-pane-menu"
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
    </div>
  );
};
