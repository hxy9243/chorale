import { act, fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  INTERFACE_ZOOM_KEY,
  useInterfaceZoom,
} from '../useInterfaceZoom';

describe('useInterfaceZoom', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--ui-zoom');
  });

  it('zooms the interface with Ctrl+wheel and persists the selection', () => {
    const { result } = renderHook(() => useInterfaceZoom());
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });

    act(() => fireEvent(window, event));

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.zoom).toBe(110);
    expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe('1.1');
    expect(localStorage.getItem(INTERFACE_ZOOM_KEY)).toBe('110');
  });

  it('restores, clamps, and resets interface zoom', () => {
    localStorage.setItem(INTERFACE_ZOOM_KEY, '150');
    const { result } = renderHook(() => useInterfaceZoom());

    expect(result.current.zoom).toBe(150);
    act(() => result.current.setZoom(999));
    expect(result.current.zoom).toBe(160);

    act(() => fireEvent.keyDown(window, { key: '0', ctrlKey: true }));
    expect(result.current.zoom).toBe(100);
  });
});
