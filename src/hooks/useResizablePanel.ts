import { useEffect, useRef } from 'react';

export type ResizablePanelOptions = {
  initialWidth?: number;
  clampWidth?: (width: number) => number;
  onWidthChange?: (width: number) => void;
  initialSize?: number;
  clampSize?: (size: number) => number;
  onSizeChange?: (size: number) => void;
  direction?: 'left' | 'right' | 'top' | 'bottom';
};

export const useResizablePanel = ({
  initialWidth,
  clampWidth,
  onWidthChange,
  initialSize,
  clampSize,
  onSizeChange,
  direction = 'right',
}: ResizablePanelOptions) => {
  const currentInitialSize = initialSize ?? initialWidth ?? 0;
  const currentClamp = clampSize ?? clampWidth ?? ((val: number) => val);
  const currentOnChange = onSizeChange ?? onWidthChange ?? (() => undefined);

  const isVertical = direction === 'top' || direction === 'bottom';
  const resizeClass = isVertical ? 'is-resizing-row' : 'is-resizing-col';

  const dragStateRef = useRef<{ startPos: number; startSize: number } | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    cleanupRef.current?.();
    dragStateRef.current = {
      startPos: isVertical ? event.clientY : event.clientX,
      startSize: currentInitialSize,
    };
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // safe fallback if pointer capture is unsupported in test env
    }

    document.body.classList.add(resizeClass);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const currentPos = isVertical ? moveEvent.clientY : moveEvent.clientX;
      const rawDelta = currentPos - dragState.startPos;
      const delta = (direction === 'left' || direction === 'top') ? -rawDelta : rawDelta;
      currentOnChange(currentClamp(dragState.startSize + delta));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      dragStateRef.current = null;
      try {
        target.releasePointerCapture(upEvent.pointerId);
      } catch {
        // safe fallback
      }
      document.body.classList.remove(resizeClass);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      cleanupRef.current = null;
    };

    cleanupRef.current = () => handlePointerUp(event.nativeEvent);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return { beginResize };
};
