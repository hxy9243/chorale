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
    target.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const rawDelta = moveEvent.clientX - dragState.startX;
      const delta = direction === 'left' ? -rawDelta : rawDelta;
      onWidthChange(clampWidth(dragState.startWidth + delta));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return { beginResize };
};
