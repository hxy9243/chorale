import { act, fireEvent, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampEditorPanelHeight,
  EDITOR_HEIGHT_KEY,
  EDITOR_VISIBLE_KEY,
  useWorkspaceLayout,
} from '../useWorkspaceLayout';

let shell: HTMLDivElement;
let shellHeight: number;
let resizeCallback: ResizeObserverCallback;
const disconnect = vi.fn();

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(EDITOR_VISIBLE_KEY, 'true');
  shellHeight = 608;
  shell = document.createElement('div');
  shell.style.paddingTop = '8px';
  Object.defineProperty(shell, 'clientHeight', { get: () => shellHeight });
  document.body.append(shell);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
    observe() {}
    disconnect = disconnect;
  });
  disconnect.mockClear();
});

afterEach(() => {
  shell.remove();
  vi.unstubAllGlobals();
});

const observeResize = () => act(() => resizeCallback([], {} as ResizeObserver));

function setup(initialProps = { vertical: true, sheetVisible: true, zoom: 100 }) {
  const shellRef = { current: shell };
  return renderHook(({ vertical, sheetVisible, zoom }) => useWorkspaceLayout({ zoom }, {
    shellRef, vertical, sheetVisible,
  }), { initialProps });
}

describe('vertical workspace sizing', () => {
  it('reserves Sheet and divider space and keeps minimum panes scrollable in short windows', () => {
    expect(clampEditorPanelHeight(1000, 600)).toBe(386);
    expect(clampEditorPanelHeight(100, 600)).toBe(180);
    expect(clampEditorPanelHeight(1000, 300)).toBe(180);
  });

  it('fits a stale persisted height before paint and stores the fitted value', () => {
    localStorage.setItem(EDITOR_HEIGHT_KEY, '2000');
    const { result } = setup();
    expect(result.current.editorHeight).toBe(386);
    expect(localStorage.getItem(EDITOR_HEIGHT_KEY)).toBe('386');
  });

  it('refits on both shell ResizeObserver notifications and window resize', () => {
    localStorage.setItem(EDITOR_HEIGHT_KEY, '380');
    const { result } = setup();
    shellHeight = 508;
    observeResize();
    expect(result.current.editorHeight).toBe(286);
    shellHeight = 458;
    act(() => { fireEvent(window, new Event('resize')); });
    expect(result.current.editorHeight).toBe(236);
    expect(localStorage.getItem(EDITOR_HEIGHT_KEY)).toBe('236');
  });

  it('fits when reopening panes or switching to vertical without truncating a hidden preference', () => {
    localStorage.setItem(EDITOR_HEIGHT_KEY, '800');
    const { result, rerender } = setup({ vertical: false, sheetVisible: true, zoom: 100 });
    expect(result.current.editorHeight).toBe(800);
    rerender({ vertical: true, sheetVisible: false, zoom: 100 });
    expect(result.current.editorHeight).toBe(800);
    rerender({ vertical: true, sheetVisible: true, zoom: 100 });
    expect(result.current.editorHeight).toBe(386);
    act(() => result.current.setEditorVisible(false));
    shellHeight = 508;
    act(() => result.current.setEditorVisible(true));
    expect(result.current.editorHeight).toBe(286);
  });

  it('fits after interface zoom changes using layout pixels rather than scaled screen coordinates', () => {
    localStorage.setItem(EDITOR_HEIGHT_KEY, '380');
    const { result, rerender } = setup();
    shellHeight = 508;
    rerender({ vertical: true, sheetVisible: true, zoom: 150 });
    expect(result.current.editorHeight).toBe(286);
  });

  it.each(['top', 'bottom'] as const)('bounds repeated %s-edge drags using the live shell size', (edge) => {
    const { result } = setup();
    const button = document.createElement('button');
    const start = () => act(() => {
      const begin = edge === 'top' ? result.current.beginEditorVerticalResize : result.current.beginEditorVerticalResizeFromBottom;
      begin({ currentTarget: button, clientY: 400, pointerId: 1 } as ReactPointerEvent<HTMLButtonElement>);
    });
    start();
    act(() => { fireEvent.pointerMove(window, { clientY: edge === 'top' ? -1000 : 2000, pointerId: 1 }); });
    expect(result.current.editorHeight).toBe(386);
    // A viewport change during the same gesture must not leave a stale maximum.
    shellHeight = 508;
    act(() => { fireEvent.pointerMove(window, { clientY: edge === 'top' ? -900 : 1900, pointerId: 1 }); });
    expect(result.current.editorHeight).toBe(286);
    act(() => { fireEvent.pointerUp(window, { pointerId: 1 }); });
    start();
    act(() => { fireEvent.pointerMove(window, { clientY: edge === 'top' ? 2000 : -1000, pointerId: 1 }); });
    expect(result.current.editorHeight).toBe(180);
    act(() => { fireEvent.pointerCancel(window, { pointerId: 1 }); });
    expect(document.body.classList.contains('is-resizing-row')).toBe(false);
  });

  it('disconnects its observer on unmount', () => {
    const { unmount } = setup();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
