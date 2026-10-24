import { act, cleanup, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STACK_COLUMNS_KEY, STACK_ROWS_KEY, useSplitStackLayout } from '../useSplitStackLayout';
import type { WorkspacePaneId } from '../useWorkspacePanes';

const sequence: WorkspacePaneId[] = ['sheet', 'editor', 'waterfall'];
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function shell(zoom = 1) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 1038, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: 822, configurable: true });
  element.style.padding = '8px 12px 0';
  document.body.append(element);
  element.getBoundingClientRect = () => ({ width: element.clientWidth * zoom, height: element.clientHeight * zoom } as DOMRect);
  return element;
}
function key(value: string) {
  return { key: value, preventDefault: vi.fn() } as unknown as ReactKeyboardEvent<HTMLButtonElement>;
}

describe('split stack layout', () => {
  it.each(['split-left', 'split-right'] as const)('places slots and collapses hidden panes in %s', orientation => {
    const { result, rerender } = renderHook(({ visible }) => useSplitStackLayout({ current: null }, orientation, sequence, visible), { initialProps: { visible: sequence } });
    const stackColumn = orientation === 'split-left' ? 1 : 3;
    expect(result.current.paneStyle('sheet')).toMatchObject({ gridColumn: stackColumn, gridRow: 1 });
    expect(result.current.paneStyle('editor')).toMatchObject({ gridColumn: stackColumn, gridRow: 3 });
    expect(result.current.paneStyle('waterfall')).toMatchObject({ gridColumn: 4 - stackColumn, gridRow: '1 / -1' });
    rerender({ visible: ['sheet', 'waterfall'] });
    expect(result.current.hasRows).toBe(false);
    expect(result.current.paneStyle('sheet').gridRow).toBe('1 / -1');
    rerender({ visible: ['sheet', 'editor'] });
    expect(result.current.hasColumns).toBe(false);
    expect(result.current.paneStyle('editor')).toMatchObject({ gridColumn: 1, gridRow: 3 });
    rerender({ visible: ['waterfall'] });
    expect(result.current.hasRows || result.current.hasColumns).toBe(false);
    expect(result.current.paneStyle('waterfall')).toMatchObject({ gridColumn: 1, gridRow: '1 / -1' });
    rerender({ visible: sequence });
    expect(result.current.paneStyle('editor')).toMatchObject({ gridColumn: stackColumn, gridRow: 3 });
  });

  it.each([1, 1.5])('resizes from rendered dimensions at interface zoom %s and persists both axes', zoom => {
    const element = shell(zoom);
    const ref = { current: element };
    const { result, unmount } = renderHook(() => useSplitStackLayout(ref, 'split-left', sequence, sequence));
    const target = document.createElement('button');
    target.setPointerCapture = vi.fn(); target.releasePointerCapture = vi.fn();
    const start = { clientX: 100, clientY: 100, pointerId: 1, currentTarget: target, nativeEvent: new Event('pointerdown') } as unknown as ReactPointerEvent<HTMLButtonElement>;
    act(() => result.current.beginColumnResize(start));
    act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 100 + 100 * zoom, pointerId: 1 })));
    act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 })));
    expect(result.current.columns).toBeCloseTo(0.65); // 100 logical px / 1000px available
    expect(result.current.rows).toBe(0.5);
    act(() => result.current.beginRowResize(start));
    act(() => window.dispatchEvent(Object.assign(new Event('pointermove'), { clientY: 100 + 80 * zoom, pointerId: 1 })));
    act(() => window.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 })));
    expect(result.current.rows).toBeCloseTo(0.6); // 80 logical px / 800px available
    expect(result.current.columns).toBeCloseTo(0.65);
    unmount();
    const restored = renderHook(() => useSplitStackLayout(ref, 'split-right', sequence, sequence));
    expect(restored.result.current.columns).toBeCloseTo(0.65);
    expect(restored.result.current.rows).toBeCloseTo(0.6);
    element.remove();
  });

  it('keeps both minimums reachable when keyboard resizing and in short windows', () => {
    const element = shell();
    const { result } = renderHook(() => useSplitStackLayout({ current: element }, 'split-left', sequence, sequence));
    act(() => result.current.onColumnKeyDown(key('Home')));
    expect(result.current.columns).toBeCloseTo(0.24);
    act(() => result.current.onRowKeyDown(key('End')));
    expect(result.current.rows).toBeCloseTo(1 - 180 / 800);
    Object.defineProperty(element, 'clientHeight', { value: 200 });
    act(() => result.current.onRowKeyDown(key('Home')));
    expect(result.current.rows).toBe(0.5);
    expect(result.current.shellStyle.gridTemplateRows).toContain('minmax(180px,');
    element.remove();
  });

  it.each(['bad', '0', '1', '-2', 'Infinity'])('ignores invalid saved ratios %s', value => {
    localStorage.setItem(STACK_COLUMNS_KEY, value); localStorage.setItem(STACK_ROWS_KEY, value);
    const { result } = renderHook(() => useSplitStackLayout({ current: null }, 'split-left', sequence, sequence));
    expect(result.current.columns).toBe(0.55); expect(result.current.rows).toBe(0.5);
  });
});
