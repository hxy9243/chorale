import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResizablePanel } from '../useResizablePanel';

describe('useResizablePanel', () => {
  it('initializes resize handler correctly', () => {
    const onWidthChange = vi.fn();
    const clampWidth = (w: number) => Math.max(100, Math.min(500, w));

    const { result } = renderHook(() => useResizablePanel({
      initialWidth: 200,
      clampWidth,
      onWidthChange,
      direction: 'right',
    }));

    expect(typeof result.current.beginResize).toBe('function');
  });
  it('removes drag listeners and body state when the pane unmounts mid-resize', () => {
    const onWidthChange = vi.fn();
    const { result, unmount } = renderHook(() => useResizablePanel({ initialWidth: 200, onWidthChange }));
    const target = document.createElement('button');
    const nativeEvent = { pointerId: 1 } as PointerEvent;
    result.current.beginResize({ clientX: 100, clientY: 0, pointerId: 1, currentTarget: target, nativeEvent } as unknown as React.PointerEvent<HTMLButtonElement>);
    expect(document.body.classList.contains('is-resizing-col')).toBe(true);
    unmount();
    expect(document.body.classList.contains('is-resizing-col')).toBe(false);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150 }));
    expect(onWidthChange).not.toHaveBeenCalled();
  });

});
