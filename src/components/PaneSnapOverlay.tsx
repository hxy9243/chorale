import React from 'react';
import type { SnapTarget } from '../hooks/useWorkspacePanes';
import { SPLIT_SNAP_GRID } from '../hooks/usePaneTabDrag';

export interface PaneSnapOverlayProps {
  activeSnapTarget: SnapTarget | null;
  paneCount?: number;
}

const TARGET_GRID = [
  ['top-left', 'Stack top left'], ['top', 'Rows · top'], ['top-right', 'Stack top right'],
  ['left', 'Columns · left'], [null, 'Keep current layout'], ['right', 'Columns · right'],
  ['bottom-left', 'Stack bottom left'], ['bottom', 'Rows · bottom'], ['bottom-right', 'Stack bottom right'],
] as const;

export const PaneSnapOverlay: React.FC<PaneSnapOverlayProps> = ({ activeSnapTarget, paneCount = 2 }) => {
  const split = paneCount === 3;
  const tracks = SPLIT_SNAP_GRID.map(value => `${value}fr`).join(' ');
  return (
    <div className="pane-snap-overlay" role="presentation" aria-hidden="true" data-testid="pane-snap-overlay">
      {split && <div className="pane-snap-target-map" data-testid="pane-snap-target-map"
        style={{ gridTemplateColumns: tracks, gridTemplateRows: tracks }}>
        {TARGET_GRID.map(([target, label]) => (
          <div key={target ?? 'center'} className={`pane-snap-zone ${target === activeSnapTarget ? 'is-active' : ''} ${target === null ? 'is-center' : ''}`}>
            <span>{target === null && activeSnapTarget ? 'Drop at an edge or corner' : label}</span>
          </div>
        ))}
      </div>}
      {activeSnapTarget && (
        <div className={`pane-snap-indicator snap-${activeSnapTarget}`} data-testid={`pane-snap-${activeSnapTarget}`}>
          <div className="pane-snap-indicator-content">
            <span className="pane-snap-indicator-label">
              {activeSnapTarget === 'top' && (split ? 'Arrange in rows · top' : 'Snap to top')}
              {activeSnapTarget === 'bottom' && (split ? 'Arrange in rows · bottom' : 'Snap to bottom')}
              {activeSnapTarget === 'left' && (split ? 'Arrange in columns · left' : 'Snap to left')}
              {activeSnapTarget === 'right' && (split ? 'Arrange in columns · right' : 'Snap to right')}
              {activeSnapTarget === 'top-left' && 'Stack top left'}
              {activeSnapTarget === 'bottom-left' && 'Stack bottom left'}
              {activeSnapTarget === 'top-right' && 'Stack top right'}
              {activeSnapTarget === 'bottom-right' && 'Stack bottom right'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
