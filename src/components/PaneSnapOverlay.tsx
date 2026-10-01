import React from 'react';
import type { SnapTarget } from '../hooks/useWorkspacePanes';

export interface PaneSnapOverlayProps {
  activeSnapTarget: SnapTarget | null;
}

export const PaneSnapOverlay: React.FC<PaneSnapOverlayProps> = ({ activeSnapTarget }) => {
  return (
    <div className="pane-snap-overlay" role="presentation" aria-hidden="true" data-testid="pane-snap-overlay">
      {activeSnapTarget && (
        <div className={`pane-snap-indicator snap-${activeSnapTarget}`} data-testid={`pane-snap-${activeSnapTarget}`}>
          <div className="pane-snap-indicator-content">
            <span className="pane-snap-indicator-label">
              {activeSnapTarget === 'top' && 'Snap to top'}
              {activeSnapTarget === 'bottom' && 'Snap to bottom'}
              {activeSnapTarget === 'left' && 'Snap to left'}
              {activeSnapTarget === 'right' && 'Snap to right'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
