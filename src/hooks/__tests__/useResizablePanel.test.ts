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
});
