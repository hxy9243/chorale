import { useEffect, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { useResizablePanel } from './useResizablePanel';
import type { PaneOrientation, WorkspacePaneId } from './useWorkspacePanes';

export const STACK_COLUMNS_KEY = 'chorale.workspace.stackColumns';
export const STACK_ROWS_KEY = 'chorale.workspace.stackRows';
const DIVIDER = 14;

const readRatio = (key: string, fallback: number) => {
  const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  const value = Number(stored);
  return stored !== null && Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
};

/** Grid positioning keeps the pane components mounted while their slots change. */
export function useSplitStackLayout(
  shellRef: RefObject<HTMLDivElement | null>,
  orientation: PaneOrientation,
  sequence: WorkspacePaneId[],
  visible: WorkspacePaneId[],
) {
  const active = orientation === 'split-left' || orientation === 'split-right';
  const stack = sequence.slice(0, 2).filter(id => visible.includes(id));
  const solo = visible.includes(sequence[2]) ? sequence[2] : null;
  const hasColumns = !!solo && stack.length > 0;
  const hasRows = stack.length === 2;
  const stackColumn = hasColumns && orientation === 'split-right' ? 3 : 1;
  const [columns, setColumns] = useState(() => readRatio(STACK_COLUMNS_KEY, 0.55));
  const [rows, setRows] = useState(() => readRatio(STACK_ROWS_KEY, 0.5));

  useEffect(() => { window.localStorage.setItem(STACK_COLUMNS_KEY, String(columns)); }, [columns]);
  useEffect(() => { window.localStorage.setItem(STACK_ROWS_KEY, String(rows)); }, [rows]);

  // Pointer coordinates include CSS zoom; client sizes and grid minimums do not.
  const measure = (vertical: boolean) => {
    const shell = shellRef.current;
    const minimum = vertical ? 180 : 240;
    if (!shell) return { space: 1000, minimum };
    const rect = shell.getBoundingClientRect();
    const size = vertical ? shell.clientHeight : shell.clientWidth;
    const scale = size > 0 ? (vertical ? rect.height : rect.width) / size : 1;
    const style = window.getComputedStyle(shell);
    const padding = vertical
      ? (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
      : (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const safeScale = scale > 0 ? scale : 1;
    return { space: Math.max(minimum * 2, size - padding - DIVIDER) * safeScale, minimum: minimum * safeScale };
  };
  const clampPixels = (size: number, vertical: boolean) => {
    const { space, minimum } = measure(vertical);
    return Math.max(minimum, Math.min(space - minimum, size));
  };
  const columnResize = useResizablePanel({
    getInitialSize: () => clampPixels(columns * measure(false).space, false),
    clampSize: size => clampPixels(size, false),
    onSizeChange: size => setColumns(size / measure(false).space),
    direction: 'right',
  });
  const rowResize = useResizablePanel({
    getInitialSize: () => clampPixels(rows * measure(true).space, true),
    clampSize: size => clampPixels(size, true),
    onSizeChange: size => setRows(size / measure(true).space),
    direction: 'bottom',
  });
  const resizeWithKeyboard = (vertical: boolean) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const backwards = vertical ? 'ArrowUp' : 'ArrowLeft';
    const forwards = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![backwards, forwards, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const { space } = measure(vertical);
    const ratio = vertical ? rows : columns;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? space
      : ratio * space + (event.key === forwards ? 0.03 : -0.03) * space;
    (vertical ? setRows : setColumns)(clampPixels(next, vertical) / space);
  };

  const paneStyle = (id: WorkspacePaneId): CSSProperties => ({
    width: '100%', height: '100%', minWidth: 0, minHeight: 0,
    gridColumn: !hasColumns ? 1 : id === solo ? (stackColumn === 1 ? 3 : 1) : stackColumn,
    gridRow: !hasRows || id === solo ? '1 / -1' : stack.indexOf(id) === 0 ? 1 : 3,
  });
  const shellStyle: CSSProperties = active ? {
    gridTemplateColumns: hasColumns ? `minmax(240px, ${columns}fr) ${DIVIDER}px minmax(240px, ${1 - columns}fr)` : 'minmax(0, 1fr)',
    gridTemplateRows: hasRows ? `minmax(180px, ${rows}fr) ${DIVIDER}px minmax(180px, ${1 - rows}fr)` : 'minmax(0, 1fr)',
  } : {};

  return { active, hasColumns, hasRows, stackColumn, columns, rows, paneStyle, shellStyle,
    beginColumnResize: columnResize.beginResize, beginRowResize: rowResize.beginResize,
    onColumnKeyDown: resizeWithKeyboard(false), onRowKeyDown: resizeWithKeyboard(true) };
}
