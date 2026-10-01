import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { SnapTarget, WorkspacePaneId } from './useWorkspacePanes';

interface UsePaneTabDragOptions {
  shellRef: RefObject<HTMLElement | null>;
  bothPanesVisible: boolean;
  rearrangePane: (paneId: WorkspacePaneId, target: SnapTarget) => void;
}

interface ActiveDrag {
  pointerId: number;
  cancel: (resetState?: boolean) => void;
}

function getSnapTarget(shell: HTMLElement | null, clientX: number, clientY: number): SnapTarget | null {
  if (!shell) return null;

  const { left, top, width, height } = shell.getBoundingClientRect();
  if (![left, top, width, height, clientX, clientY].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  const relX = (clientX - left) / width;
  const relY = (clientY - top) / height;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

  if (relY < relX && relY < 1 - relX) return 'top';
  if (relY > relX && relY > 1 - relX) return 'bottom';
  return relX < 0.5 ? 'left' : 'right';
}

export function usePaneTabDrag({ shellRef, bothPanesVisible, rearrangePane }: UsePaneTabDragOptions) {
  const [draggingPane, setDraggingPane] = useState<WorkspacePaneId | null>(null);
  const [activeSnapTarget, setActiveSnapTarget] = useState<SnapTarget | null>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);

  useEffect(() => {
    if (!bothPanesVisible) activeDragRef.current?.cancel();
  }, [bothPanesVisible]);

  useEffect(() => () => activeDragRef.current?.cancel(false), []);

  const handleTabPointerDown = useCallback((paneId: WorkspacePaneId) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || !bothPanesVisible) return;
    if (event.target instanceof Element && event.target.closest('.pane-tab-close')) return;
    // A second finger must not take over an in-progress gesture.
    if (activeDragRef.current && activeDragRef.current.pointerId !== event.pointerId) return;
    activeDragRef.current?.cancel();

    const { clientX: startX, clientY: startY, pointerId } = event;
    const target = event.currentTarget as HTMLElement;
    let hasMoved = false;
    let finished = false;

    const cleanup = (resetState = true) => {
      if (finished) return;
      finished = true;
      activeDragRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      target.removeEventListener('lostpointercapture', handlePointerCancel);
      document.body.classList.remove('is-rearranging-panes');
      // Remove listeners first: releasing capture can dispatch lostpointercapture.
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // Capture may already be lost, or unavailable in an embedded/test environment.
      }
      if (resetState) {
        setDraggingPane(null);
        setActiveSnapTarget(null);
      }
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (!hasMoved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) {
        hasMoved = true;
        setDraggingPane(paneId);
        document.body.classList.add('is-rearranging-panes');
      }
      if (hasMoved) {
        setActiveSnapTarget(getSnapTarget(shellRef.current, moveEvent.clientX, moveEvent.clientY));
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      const finalTarget = hasMoved
        ? getSnapTarget(shellRef.current, upEvent.clientX, upEvent.clientY)
        : null;
      cleanup();
      if (finalTarget) rearrangePane(paneId, finalTarget);
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cleanup();
    };
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') cleanup();
    };
    const handleBlur = () => cleanup();

    activeDragRef.current = { pointerId, cancel: cleanup };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    target.addEventListener('lostpointercapture', handlePointerCancel);
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Window listeners still support environments without pointer capture.
    }
  }, [bothPanesVisible, rearrangePane, shellRef]);

  return { handleTabPointerDown, draggingPane, activeSnapTarget };
}
