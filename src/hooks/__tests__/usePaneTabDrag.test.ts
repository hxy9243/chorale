import { act, cleanup, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePaneTabDrag } from '../usePaneTabDrag';
import type { WorkspacePaneId } from '../useWorkspacePanes';

const bounds = { left: 100, top: 50, width: 800, height: 600 };

function pointerEvent(type: string, clientX = 500, clientY = 350, pointerId = 1) {
  return Object.assign(new Event(type), { clientX, clientY, pointerId });
}

function setup(bothPanesVisible = true) {
  const shell = document.createElement('div');
  const tab = document.createElement('div');
  const close = document.createElement('button');
  close.className = 'pane-tab-close';
  tab.append(close);
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  tab.setPointerCapture = setPointerCapture;
  tab.releasePointerCapture = releasePointerCapture;
  const getBoundingClientRect = vi.fn(() => bounds as DOMRect);
  shell.getBoundingClientRect = getBoundingClientRect;
  const shellRef = { current: shell as HTMLElement | null };
  const rearrangePane = vi.fn();
  const hook = renderHook(({ visible }) => usePaneTabDrag({
    shellRef,
    bothPanesVisible: visible,
    rearrangePane,
  }), { initialProps: { visible: bothPanesVisible } });

  function start(paneId: WorkspacePaneId = 'sheet', overrides: Partial<ReactPointerEvent> = {}) {
    act(() => hook.result.current.handleTabPointerDown(paneId)({
      button: 0,
      pointerId: 1,
      clientX: 500,
      clientY: 350,
      target: tab,
      currentTarget: tab,
      ...overrides,
    } as ReactPointerEvent));
  }
  function dispatch(type: string, clientX = 500, clientY = 350, pointerId = 1) {
    act(() => { window.dispatchEvent(pointerEvent(type, clientX, clientY, pointerId)); });
  }
  function expectIdle() {
    expect(hook.result.current.draggingPane).toBeNull();
    expect(hook.result.current.activeSnapTarget).toBeNull();
    expect(document.body.classList.contains('is-rearranging-panes')).toBe(false);
  }

  return {
    ...hook, start, dispatch, expectIdle, shellRef, tab, close, getBoundingClientRect,
    rearrangePane, setPointerCapture, releasePointerCapture,
  };
}

afterEach(() => {
  cleanup();
  document.body.classList.remove('is-rearranging-panes');
  vi.restoreAllMocks();
});

describe('usePaneTabDrag', () => {
  it.each([
    ['left', 110, 350],
    ['right', 890, 350],
    ['top', 500, 60],
    ['bottom', 500, 640],
  ] as const)('previews and commits the %s snap zone exactly once', (zone, x, y) => {
    const drag = setup();
    drag.start('editor');
    drag.dispatch('pointermove', x, y);
    expect(drag.result.current.draggingPane).toBe('editor');
    expect(drag.result.current.activeSnapTarget).toBe(zone);
    expect(document.body.classList.contains('is-rearranging-panes')).toBe(true);
    drag.dispatch('pointerup', x, y);
    expect(drag.rearrangePane).toHaveBeenCalledExactlyOnceWith('editor', zone);
    expect(drag.releasePointerCapture).toHaveBeenCalledWith(1);
    drag.expectIdle();
    drag.dispatch('pointerup', x, y);
    expect(drag.rearrangePane).toHaveBeenCalledTimes(1);
  });

  it('does not rearrange a click or a movement below the drag threshold', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 502, 352);
    drag.expectIdle();
    drag.dispatch('pointerup', 502, 352);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
    drag.expectIdle();
  });

  it('discards pointercancel rather than committing its in-bounds coordinates', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.dispatch('pointercancel', 500, 60);
    drag.expectIdle();
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
  });

  it.each([
    [99, 350], [901, 350], [500, 49], [500, 651],
  ])('clears the preview outside the workspace at (%s, %s) and discards the drop', (x, y) => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    expect(drag.result.current.activeSnapTarget).toBe('top');
    drag.dispatch('pointermove', x, y);
    expect(drag.result.current.activeSnapTarget).toBeNull();
    drag.dispatch('pointerup', x, y);
    drag.expectIdle();
    expect(drag.rearrangePane).not.toHaveBeenCalled();
  });

  it('checks the final coordinates even without a final pointermove', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.dispatch('pointerup', 901, 350);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
    drag.expectIdle();
  });

  it('restores the preview after re-entering and uses the final drop zone', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 99, 350);
    expect(drag.result.current.activeSnapTarget).toBeNull();
    drag.dispatch('pointermove', 110, 350);
    expect(drag.result.current.activeSnapTarget).toBe('left');
    drag.dispatch('pointerup', 500, 640);
    expect(drag.rearrangePane).toHaveBeenCalledExactlyOnceWith('sheet', 'bottom');
  });

  it.each([
    { width: 0 }, { height: 0 }, { width: -1 }, { height: -1 },
    { width: Number.NaN }, { height: Number.POSITIVE_INFINITY }, { left: Number.NaN },
  ])('requires a finite, positive-size workspace rect: %j', (invalidBounds) => {
    const drag = setup();
    drag.getBoundingClientRect.mockReturnValue({ ...bounds, ...invalidBounds } as DOMRect);
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    expect(drag.result.current.activeSnapTarget).toBeNull();
    drag.dispatch('pointerup', 500, 60);
    drag.expectIdle();
    expect(drag.rearrangePane).not.toHaveBeenCalled();
  });

  it('does not commit when the workspace disappears during a drag', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.shellRef.current = null;
    drag.dispatch('pointermove', 500, 60);
    expect(drag.result.current.activeSnapTarget).toBeNull();
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
    drag.expectIdle();
  });

  it('ignores unrelated pointer movement, completion, cancellation, and capture loss', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60, 2);
    drag.expectIdle();
    drag.dispatch('pointermove', 500, 60);
    drag.start('editor', { pointerId: 2 });
    drag.dispatch('pointermove', 110, 350, 2);
    drag.dispatch('pointerup', 110, 350, 2);
    drag.dispatch('pointercancel', 500, 60, 2);
    act(() => { drag.tab.dispatchEvent(pointerEvent('lostpointercapture', 500, 60, 2)); });
    expect(drag.result.current.draggingPane).toBe('sheet');
    expect(drag.result.current.activeSnapTarget).toBe('top');
    expect(drag.setPointerCapture).toHaveBeenCalledTimes(1);
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).toHaveBeenCalledExactlyOnceWith('sheet', 'top');
    drag.expectIdle();
  });

  it.each(['Escape', 'lostpointercapture', 'blur'] as const)('cancels on %s without committing', (reason) => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    act(() => {
      if (reason === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else drag.tab.dispatchEvent(pointerEvent(reason));
    });
    drag.expectIdle();
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
  });

  it('cancels when either pane is hidden', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.rerender({ visible: false });
    drag.expectIdle();
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
  });

  it('ignores close buttons, right/middle buttons, and single-pane layouts', () => {
    const drag = setup();
    drag.start('sheet', { target: drag.close });
    drag.start('sheet', { button: 1 });
    drag.start('sheet', { button: 2 });
    drag.rerender({ visible: false });
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.dispatch('pointerup', 500, 60);
    expect(drag.setPointerCapture).not.toHaveBeenCalled();
    expect(drag.rearrangePane).not.toHaveBeenCalled();
    drag.expectIdle();
  });

  it('cleans up an interrupted gesture before starting a new one for the same pointer', () => {
    const drag = setup();
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.start('editor');
    drag.expectIdle();
    expect(drag.releasePointerCapture).toHaveBeenCalledTimes(1);
    drag.dispatch('pointermove', 110, 350);
    drag.dispatch('pointerup', 110, 350);
    expect(drag.rearrangePane).toHaveBeenCalledExactlyOnceWith('editor', 'left');
    drag.expectIdle();
  });

  it('supports repeated completed and canceled drags without leaking listeners', () => {
    const drag = setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    for (let i = 0; i < 4; i++) {
      drag.start();
      drag.dispatch('pointermove', 500, 60);
      drag.dispatch(i % 2 ? 'pointercancel' : 'pointerup', 500, 60);
      drag.expectIdle();
    }
    expect(drag.rearrangePane).toHaveBeenCalledTimes(2);
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur']) {
      const added = add.mock.calls.filter(([eventType]) => eventType === type);
      const removed = remove.mock.calls.filter(([eventType]) => eventType === type);
      expect(added).toHaveLength(4);
      expect(removed).toEqual(added);
    }
    drag.dispatch('pointermove', 500, 60);
    drag.dispatch('pointerup', 500, 60);
    drag.expectIdle();
    expect(drag.rearrangePane).toHaveBeenCalledTimes(2);
  });

  it('releases capture and all listeners when unmounted during a drag', () => {
    const drag = setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const removeFromTab = vi.spyOn(drag.tab, 'removeEventListener');
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.unmount();
    expect(document.body.classList.contains('is-rearranging-panes')).toBe(false);
    expect(drag.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur']) {
      expect(remove.mock.calls.filter(([eventType]) => eventType === type))
        .toEqual(add.mock.calls.filter(([eventType]) => eventType === type));
    }
    expect(removeFromTab).toHaveBeenCalledWith('lostpointercapture', expect.any(Function));
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).not.toHaveBeenCalled();
  });

  it('still works if pointer capture is unavailable', () => {
    const drag = setup();
    drag.setPointerCapture.mockImplementation(() => { throw new Error('Capture unavailable'); });
    drag.releasePointerCapture.mockImplementation(() => { throw new Error('Capture unavailable'); });
    drag.start();
    drag.dispatch('pointermove', 500, 60);
    drag.dispatch('pointerup', 500, 60);
    expect(drag.rearrangePane).toHaveBeenCalledExactlyOnceWith('sheet', 'top');
    drag.expectIdle();
  });
});
