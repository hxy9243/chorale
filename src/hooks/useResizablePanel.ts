import { useRef } from 'react';

export type ResizablePanelOptions = {
  initialWidth: number;
  clampWidth: (width: number) => number;
  onWidthChange: (width: number) => void;
  direction?: 'left' | 'right';
};

export const useResizablePanel = ({
  initialWidth,
  clampWidth,
  onWidthChange,
  direction = 'right',
}: ResizablePanelOptions) => {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: initialWidth,
    };
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // safe fallback if pointer capture is unsupported in test env
    }

    document.body.classList.add('is-resizing-col');

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const rawDelta = moveEvent.clientX - dragState.startX;
      const delta = direction === 'left' ? -rawDelta : rawDelta;
      onWidthChange(clampWidth(dragState.startWidth + delta));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      dragStateRef.current = null;
      try {
        target.releasePointerCapture(upEvent.pointerId);
      } catch {
        // safe fallback
      }
      document.body.classList.remove('is-resizing-col');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return { beginResize };
};
