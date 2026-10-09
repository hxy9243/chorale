import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useWorkspacePanes,
  PANE_ORIENTATION_KEY,
  PANE_ORDER_KEY,
  PANE_SEQUENCE_KEY,
} from '../useWorkspacePanes';

describe('useWorkspacePanes', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('initializes with default horizontal orientation and sheet-first order', () => {
    const { result } = renderHook(() => useWorkspacePanes());
    expect(result.current.sheetVisible).toBe(true);
    expect(result.current.paneOrientation).toBe('horizontal');
    expect(result.current.paneOrder).toBe('sheet-first');
    expect(result.current.sheetPaneOnRight).toBe(false);
  });

  it('restores stored orientation and order from localStorage', () => {
    window.localStorage.setItem(PANE_ORIENTATION_KEY, 'vertical');
    window.localStorage.setItem(PANE_ORDER_KEY, 'editor-first');

    const { result } = renderHook(() => useWorkspacePanes());
    expect(result.current.paneOrientation).toBe('vertical');
    expect(result.current.paneOrder).toBe('editor-first');
  });

  it('rearranges pane to top (vertical split, dragged on top)', () => {
    const { result } = renderHook(() => useWorkspacePanes());

    // Drag ABC editor to top -> editor on top, sheet on bottom
    act(() => {
      result.current.rearrangePane('editor', 'top');
    });
    expect(result.current.paneOrientation).toBe('vertical');
    expect(result.current.paneOrder).toBe('editor-first');
    expect(window.localStorage.getItem(PANE_ORIENTATION_KEY)).toBe('vertical');
    expect(window.localStorage.getItem(PANE_ORDER_KEY)).toBe('editor-first');

    // Drag sheet to top -> sheet on top, editor on bottom
    act(() => {
      result.current.rearrangePane('sheet', 'top');
    });
    expect(result.current.paneOrientation).toBe('vertical');
    expect(result.current.paneOrder).toBe('sheet-first');
  });

  it('rearranges pane to bottom (vertical split, dragged on bottom)', () => {
    const { result } = renderHook(() => useWorkspacePanes());

    // Drag ABC editor to bottom -> sheet on top, editor on bottom
    act(() => {
      result.current.rearrangePane('editor', 'bottom');
    });
    expect(result.current.paneOrientation).toBe('vertical');
    expect(result.current.paneOrder).toBe('sheet-first');

    // Drag sheet to bottom -> editor on top, sheet on bottom
    act(() => {
      result.current.rearrangePane('sheet', 'bottom');
    });
    expect(result.current.paneOrientation).toBe('vertical');
    expect(result.current.paneOrder).toBe('editor-first');
  });

  it('rearranges pane to left and right (horizontal split)', () => {
    const { result } = renderHook(() => useWorkspacePanes());

    // Drag editor to left -> editor on left, sheet on right
    act(() => {
      result.current.rearrangePane('editor', 'left');
    });
    expect(result.current.paneOrientation).toBe('horizontal');
    expect(result.current.paneOrder).toBe('editor-first');
    expect(result.current.sheetPaneOnRight).toBe(true);

    // Drag editor to right -> sheet on left, editor on right
    act(() => {
      result.current.rearrangePane('editor', 'right');
    });
    expect(result.current.paneOrientation).toBe('horizontal');
    expect(result.current.paneOrder).toBe('sheet-first');
    expect(result.current.sheetPaneOnRight).toBe(false);
  });

  it('supports backwards-compatible sheetPaneOnRight setter', () => {
    const { result } = renderHook(() => useWorkspacePanes());
    act(() => {
      result.current.setSheetPaneOnRight(true);
    });
    expect(result.current.sheetPaneOnRight).toBe(true);
    expect(result.current.paneOrder).toBe('editor-first');

    act(() => {
      result.current.setSheetPaneOnRight(false);
    });
    expect(result.current.sheetPaneOnRight).toBe(false);
    expect(result.current.paneOrder).toBe('sheet-first');
  });
  it.each(['left', 'right', 'top', 'bottom'] as const)('snaps Waterfall to %s and restores the full sequence', (target) => {
    const { result, unmount } = renderHook(() => useWorkspacePanes());
    act(() => result.current.rearrangePane('waterfall', target));
    const first = target === 'left' || target === 'top';
    const expected = first ? ['waterfall', 'sheet', 'editor'] : ['sheet', 'editor', 'waterfall'];
    expect(result.current.paneSequence).toEqual(expected);
    expect(result.current.paneOrientation).toBe(target === 'top' || target === 'bottom' ? 'vertical' : 'horizontal');
    expect(JSON.parse(localStorage.getItem(PANE_SEQUENCE_KEY)!)).toEqual(expected);
    unmount();
    const restored = renderHook(() => useWorkspacePanes());
    expect(restored.result.current.paneSequence).toEqual(expected);
  });

  it('moves Sheet and ABC around Waterfall without losing any pane', () => {
    const { result } = renderHook(() => useWorkspacePanes());
    act(() => result.current.rearrangePane('waterfall', 'left'));
    act(() => result.current.rearrangePane('editor', 'left'));
    expect(result.current.paneSequence).toEqual(['editor', 'waterfall', 'sheet']);
    act(() => result.current.rearrangePane('sheet', 'top'));
    expect(result.current.paneSequence).toEqual(['sheet', 'editor', 'waterfall']);
  });

  it.each(['null', '{', '["sheet","sheet","waterfall"]', '["sheet","editor","unknown"]'])('ignores invalid stored sequence %s', (stored) => {
    localStorage.setItem(PANE_ORDER_KEY, 'editor-first');
    localStorage.setItem(PANE_SEQUENCE_KEY, stored);
    const { result } = renderHook(() => useWorkspacePanes());
    expect(result.current.paneSequence).toEqual(['editor', 'sheet', 'waterfall']);
  });

});
