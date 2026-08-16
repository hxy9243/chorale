import { render, screen, fireEvent, waitFor, createEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileRail } from '../FileRail';
import { createDocumentFromAbc } from '../../utils/fileSession';

describe('FileRail Component', () => {
  const doc1 = createDocumentFromAbc('Bach Minuet.xml', 'musicxml', 'X:1\nK:G\nGAB');
  const doc2 = createDocumentFromAbc('Beethoven Ode.xml', 'musicxml', 'X:1\nK:C\nEDCD');
  const doc3 = createDocumentFromAbc('Mozart Sonata.xml', 'musicxml', 'X:1\nK:C\nCEGc');

  const defaultProps = {
    documents: [doc1, doc2],
    activeFileId: doc1.id,
    onSelectDocument: vi.fn(),
    onFileLoaded: vi.fn(),
    loading: false,
    error: null,
  };
  const getFirstFileButton = () => screen.getByRole('button', { name: 'Open Bach Minuet' });

  const setVerticalFileGeometry = (container: HTMLElement) => {
    const fileList = container.querySelector<HTMLElement>('.file-list')!;
    const rowHeight = 64;
    const rowGap = 8;
    const listTop = 100;
    const rows = [...fileList.querySelectorAll<HTMLElement>('.file-item')];
    rows.forEach((row) => {
      row.getBoundingClientRect = () => {
        const currentRows = [...fileList.querySelectorAll<HTMLElement>('.file-item')];
        const index = currentRows.indexOf(row);
        const top = listTop + index * (rowHeight + rowGap);
        return {
          top,
          bottom: top + rowHeight,
          left: 0,
          right: 240,
          width: 240,
          height: rowHeight,
          x: 0,
          y: top,
        } as DOMRect;
      };
    });
    fileList.getBoundingClientRect = () => ({
      top: listTop,
      bottom: listTop + rows.length * (rowHeight + rowGap) + 24,
      left: 0,
      right: 240,
      width: 240,
      height: rows.length * (rowHeight + rowGap) + 24,
      x: 0,
      y: listTop,
    } as DOMRect);
    return { fileList, listTop, rowHeight, rowGap };
  };

  const createDataTransfer = (fileId: string) => ({
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn(),
    setDragImage: vi.fn(),
    getData: vi.fn(() => fileId),
  });

  const fireDragStartAt = (
    element: Element,
    dataTransfer: ReturnType<typeof createDataTransfer>,
    clientY: number,
  ) => {
    const event = createEvent.dragStart(element, { dataTransfer });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(element, event);
  };
  const fireDragOverAt = (
    element: Element,
    dataTransfer: ReturnType<typeof createDataTransfer>,
    clientY: number,
  ) => {
    const event = createEvent.dragOver(element, { dataTransfer });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(element, event);
  };
  const fireDropAt = (
    element: Element,
    dataTransfer: ReturnType<typeof createDataTransfer>,
    clientY: number,
  ) => {
    const event = createEvent.drop(element, { dataTransfer });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(element, event);
  };
  const fireDragEndAt = (
    element: Element,
    dataTransfer: ReturnType<typeof createDataTransfer>,
    clientY: number,
  ) => {
    const event = createEvent.dragEnd(element, { dataTransfer });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(element, event);
  };

  it('renders icon-only work tabs and opens settings directly', () => {
    const onOpenSettings = vi.fn();
    render(<FileRail {...defaultProps} onOpenSettings={onOpenSettings} />);

    const filesTab = screen.getByRole('tab', { name: 'Files' });
    const toolsTab = screen.getByRole('tab', { name: 'Tools' });
    const settingsButton = screen.getByRole('button', { name: 'Settings' });

    expect(filesTab.textContent).toBe('');
    expect(toolsTab.textContent).toBe('');
    expect(settingsButton.textContent).toBe('');
    expect(filesTab.getAttribute('title')).toBe('Files');
    expect(toolsTab.getAttribute('title')).toBe('Tools');
    expect(settingsButton.getAttribute('title')).toBe('Settings');
    expect(screen.getByText('Import score')).toBeDefined();
    expect(screen.getByRole('tabpanel', { name: 'Files' })).toBeDefined();

    fireEvent.click(toolsTab);
    expect(screen.getByRole('tabpanel', { name: 'Tools' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'ABC display' })).toBeDefined();

    fireEvent.click(settingsButton);
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('tabpanel', { name: 'Settings' })).toBeNull();
    expect(screen.queryByText('LIBRARY')).toBeNull();
    expect(screen.queryByText('PROJECTS')).toBeNull();
  });

  it('owns the ABC display toggle and settings entry point', () => {
    const onToggleEditor = vi.fn();
    const onOpenSettings = vi.fn();
    const { rerender } = render(
      <FileRail
        {...defaultProps}
        onToggleEditor={onToggleEditor}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    const abcDisplay = screen.getByRole('button', { name: 'ABC display' });
    expect(abcDisplay.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(abcDisplay);
    expect(onToggleEditor).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();

    rerender(
      <FileRail
        {...defaultProps}
        editorVisible
        onToggleEditor={onToggleEditor}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    expect(screen.getByRole('button', { name: 'ABC display' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('renders active document names', () => {
    render(<FileRail {...defaultProps} />);

    expect(screen.getByText('Bach Minuet')).toBeDefined();
    expect(screen.getByText('Beethoven Ode')).toBeDefined();
  });

  it('calls onSelectDocument when an active file item is clicked', () => {
    render(<FileRail {...defaultProps} />);

    const doc2Button = screen.getByText('Beethoven Ode');
    fireEvent.click(doc2Button);

    expect(defaultProps.onSelectDocument).toHaveBeenCalledWith(doc2.id);
  });

  it('calls onDeleteDocument when delete button is clicked', () => {
    const onDeleteDocument = vi.fn();
    render(<FileRail {...defaultProps} onDeleteDocument={onDeleteDocument} />);

    const deleteBtn = screen.getByLabelText(`Delete ${doc1.name}`);
    fireEvent.click(deleteBtn);

    expect(onDeleteDocument).toHaveBeenCalledWith(doc1.id);
  });

  it('reorders rows live like browser tabs and preserves keyboard reordering', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);

    const source = getFirstFileButton();
    expect(container.querySelector('.file-drag-handle')).toBeNull();
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const sourceCenterY = listTop + rowHeight / 2;
    const targetLowerY = listTop + rowHeight + rowGap + rowHeight * 0.75;

    fireDragStartAt(source, dataTransfer, sourceCenterY);
    expect(source.closest('.file-item')?.className).toContain('dragging');
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    fireDragOverAt(target, dataTransfer, targetLowerY);
    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
    fireDropAt(target, dataTransfer, targetLowerY);
    fireDragEndAt(source, dataTransfer, targetLowerY);

    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
    expect(onReorderDocument).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(source, { key: 'ArrowUp' });
    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Bach Minuet', 'Beethoven Ode']);
    expect(onReorderDocument).toHaveBeenLastCalledWith(doc1.id, doc2.id, 'before');
    expect(screen.queryByLabelText(`Move ${doc1.name} down`)).toBeNull();
  });

  it('positions a native drag by the dragged row center instead of the raw pointer', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const source = getFirstFileButton();
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const grabNearTopY = listTop + rowHeight * 0.1;
    const targetQuarterY = listTop + rowHeight + rowGap + rowHeight * 0.25;

    fireDragStartAt(source, dataTransfer, grabNearTopY);
    fireDragOverAt(target, dataTransfer, targetQuarterY);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
  });

  it('does not reorder early when the row was grabbed near its bottom edge', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const source = getFirstFileButton();
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const grabNearBottomY = listTop + rowHeight * 0.9;
    const targetThreeQuarterY = listTop + rowHeight + rowGap + rowHeight * 0.75;

    fireDragStartAt(source, dataTransfer, grabNearBottomY);
    fireDragOverAt(target, dataTransfer, targetThreeQuarterY);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Bach Minuet', 'Beethoven Ode']);
  });

  it('moves across multiple rows using their rendered centers', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail
        {...defaultProps}
        documents={[doc1, doc2, doc3]}
        onReorderDocument={onReorderDocument}
      />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const source = getFirstFileButton();
    const target = screen.getByRole('button', { name: 'Open Mozart Sonata' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const sourceCenterY = listTop + rowHeight / 2;
    const thirdRowLowerY = listTop + (rowHeight + rowGap) * 2 + rowHeight * 0.75;

    fireDragStartAt(source, dataTransfer, sourceCenterY);
    fireDragOverAt(target, dataTransfer, thirdRowLowerY);
    fireDropAt(target, dataTransfer, thirdRowLowerY);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Mozart Sonata', 'Bach Minuet']);
    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc3.id, 'after');
  });

  it('uses a native row drag image, removes the source placeholder, and keeps the dropped order', async () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const source = getFirstFileButton();
    const sourceRow = source.closest<HTMLElement>('.file-item')!;
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const dataTransfer = createDataTransfer(doc1.id);
    const sourceCenterY = listTop + rowHeight / 2;
    const trailingY = listTop + (rowHeight + rowGap) * 2 + 12;

    expect(sourceRow.draggable).toBe(true);
    expect(source.draggable).toBe(false);
    fireDragStartAt(source, dataTransfer, sourceCenterY);
    const dragImage = dataTransfer.setDragImage.mock.calls[0]?.[0] as HTMLElement;
    expect(dragImage.className).toContain('file-item-drag-image');
    expect(document.body.contains(dragImage)).toBe(true);

    await waitFor(() => {
      expect(sourceRow.className).toContain('drag-source-placeholder');
    });
    expect([...fileList.querySelectorAll('.file-item:not(.drag-source-placeholder)')]).toHaveLength(1);

    fireDragOverAt(fileList, dataTransfer, trailingY);
    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
    fireDropAt(fileList, dataTransfer, trailingY);

    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
    expect(sourceRow.className).not.toContain('drag-source-placeholder');
    expect(document.body.contains(dragImage)).toBe(false);
  });

  it('commits the live order when Chromium ends a fast drag without a drop event', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const source = getFirstFileButton();
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const sourceCenterY = listTop + rowHeight / 2;
    const targetLowerY = listTop + rowHeight + rowGap + rowHeight * 0.75;

    fireDragStartAt(source, dataTransfer, sourceCenterY);
    fireDragOverAt(target, dataTransfer, targetLowerY);
    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);

    fireDragEndAt(source, dataTransfer, targetLowerY);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
  });

  it('commits a fast pointer gesture when Chromium releases before dragstart', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const sourceRow = getFirstFileButton()
      .closest<HTMLElement>('.file-item')!;
    const sourceCenterY = listTop + rowHeight / 2;
    const targetLowerY = listTop + rowHeight + rowGap + rowHeight * 0.75;
    const pointerDown = createEvent.pointerDown(sourceRow, { button: 0, pointerId: 1 });
    Object.defineProperties(pointerDown, {
      clientX: { value: 20 },
      clientY: { value: sourceCenterY },
      pointerId: { value: 1 },
    });
    const pointerUp = createEvent.pointerUp(window, { button: 0, pointerId: 1 });
    Object.defineProperties(pointerUp, {
      clientX: { value: 20 },
      clientY: { value: targetLowerY },
      pointerId: { value: 1 },
    });

    fireEvent(sourceRow, pointerDown);
    fireEvent(window, pointerUp);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
  });

  it('does not treat a click or an outside release as a fallback reorder', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight } = setVerticalFileGeometry(container);
    const sourceRow = getFirstFileButton()
      .closest<HTMLElement>('.file-item')!;
    const sourceCenterY = listTop + rowHeight / 2;
    const firePointerGesture = (endX: number, endY: number, pointerId: number) => {
      const pointerDown = createEvent.pointerDown(sourceRow, { button: 0, pointerId });
      Object.defineProperties(pointerDown, {
        clientX: { value: 20 },
        clientY: { value: sourceCenterY },
        pointerId: { value: pointerId },
      });
      const pointerUp = createEvent.pointerUp(window, { button: 0, pointerId });
      Object.defineProperties(pointerUp, {
        clientX: { value: endX },
        clientY: { value: endY },
        pointerId: { value: pointerId },
      });
      fireEvent(sourceRow, pointerDown);
      fireEvent(window, pointerUp);
    };

    firePointerGesture(20, sourceCenterY, 1);
    firePointerGesture(300, listTop + rowHeight * 2, 2);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Bach Minuet', 'Beethoven Ode']);
    expect(onReorderDocument).not.toHaveBeenCalled();
  });

  it('recomputes the final pointer position on drop', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const source = getFirstFileButton();
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const sourceCenterY = listTop + rowHeight / 2;
    const targetLowerY = listTop + rowHeight + rowGap + rowHeight * 0.75;
    const finalBeforeFirstRowY = listTop + rowHeight * 0.25;

    fireDragStartAt(source, dataTransfer, sourceCenterY);
    fireDragOverAt(target, dataTransfer, targetLowerY);
    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);

    fireDropAt(fileList, dataTransfer, finalBeforeFirstRowY);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Bach Minuet', 'Beethoven Ode']);
    expect(onReorderDocument).not.toHaveBeenCalled();
  });

  it('restores the starting order only after an explicit Escape cancellation', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const source = getFirstFileButton();
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest<HTMLElement>('.file-item')!;
    const dataTransfer = createDataTransfer(doc1.id);
    const sourceCenterY = listTop + rowHeight / 2;
    const targetLowerY = listTop + rowHeight + rowGap + rowHeight * 0.75;

    fireDragStartAt(source, dataTransfer, sourceCenterY);
    fireDragOverAt(target, dataTransfer, targetLowerY);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireDragEndAt(source, dataTransfer, targetLowerY);

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Bach Minuet', 'Beethoven Ode']);
    expect(onReorderDocument).not.toHaveBeenCalled();
  });

  it('collapses the sidebar when clicking the currently active tab icon', () => {
    const onToggleCollapse = vi.fn();
    render(<FileRail {...defaultProps} onToggleCollapse={onToggleCollapse} onBeginResize={vi.fn()} />);

    const filesTab = screen.getByRole('tab', { name: 'Files' });
    const toolsTab = screen.getByRole('tab', { name: 'Tools' });

    expect(filesTab.getAttribute('aria-selected')).toBe('true');
    expect(filesTab.classList.contains('active')).toBe(true);
    expect(document.querySelector('.file-rail-resize-handle')).not.toBeNull();

    // Files tab is active by default. Clicking it again should trigger toggle collapse.
    fireEvent.click(filesTab);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    // Switching to Tools tab should not toggle collapse if sidebar is open.
    fireEvent.click(toolsTab);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tabpanel', { name: 'Tools' })).toBeDefined();

    // Clicking active Tools tab should trigger toggle collapse.
    fireEvent.click(toolsTab);
    expect(onToggleCollapse).toHaveBeenCalledTimes(2);
  });

  it('keeps icon rail visible but hides content panel and resize handle while collapsed', () => {
    const onToggleCollapse = vi.fn();
    render(
      <FileRail
        {...defaultProps}
        collapsed
        onToggleCollapse={onToggleCollapse}
        onBeginResize={vi.fn()}
      />,
    );

    const filesTab = screen.getByRole('tab', { name: 'Files' });
    const toolsTab = screen.getByRole('tab', { name: 'Tools' });
    const settingsButton = screen.getByRole('button', { name: 'Settings' });

    // Tabs remain accessible in DOM
    expect(filesTab).toBeDefined();
    expect(toolsTab).toBeDefined();
    expect(settingsButton).toBeDefined();

    // No tab shows active state when panel is collapsed
    expect(filesTab.getAttribute('aria-selected')).toBe('false');
    expect(toolsTab.getAttribute('aria-selected')).toBe('false');
    expect(filesTab.classList.contains('active')).toBe(false);
    expect(toolsTab.classList.contains('active')).toBe(false);

    // Content panel stack is hidden and resize handle is not present
    const panelStack = document.querySelector('.file-rail-panel-stack');
    expect(panelStack?.hasAttribute('hidden')).toBe(true);
    expect(document.querySelector('.file-rail-resize-handle')).toBeNull();

    // Clicking active tab while collapsed triggers expand (toggle collapse).
    fireEvent.click(filesTab);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    // Clicking different tab while collapsed switches tab and triggers expand.
    fireEvent.click(toolsTab);
    expect(onToggleCollapse).toHaveBeenCalledTimes(2);
  });
});

