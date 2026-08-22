import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileRail } from '../FileRail';
import { createDocumentFromAbc } from '../../utils/fileSession';

describe('FileRail Component', () => {
  const doc1 = createDocumentFromAbc('Bach Minuet.xml', 'musicxml', 'X:1\nK:G\nGAB');
  const doc2 = createDocumentFromAbc('Beethoven Ode.xml', 'musicxml', 'X:1\nK:C\nEDCD');

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
    const rowHeight = 44;
    const rowGap = 2;
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

  it('removes the leading file icon and avoids native draggable rows', () => {
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={vi.fn()} />,
    );

    expect(container.querySelector('.file-icon')).toBeNull();
    expect(container.querySelector('.file-drag-handle')).toBeNull();
    expect([...container.querySelectorAll<HTMLElement>('.file-item')]
      .every((row) => !row.draggable)).toBe(true);
    expect(getFirstFileButton().firstElementChild?.className).toBe('file-item-info');
  });

  it('keeps arrow-key reordering on the focused file name', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const fileList = container.querySelector<HTMLElement>('.file-list')!;

    fireEvent.keyDown(getFirstFileButton(), { key: 'ArrowDown' });

    expect([...fileList.querySelectorAll('.file-item-name')].map((element) => element.textContent))
      .toEqual(['Beethoven Ode', 'Bach Minuet']);
    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
  });

  it('keeps a visible source row and overlay through a pointer drag', async () => {
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={vi.fn()} />,
    );
    const { fileList, listTop, rowHeight, rowGap } = setVerticalFileGeometry(container);
    const sourceRow = getFirstFileButton().closest<HTMLElement>('.file-item')!;
    const sourceCenterY = listTop + rowHeight / 2;
    const targetCenterY = listTop + rowHeight + rowGap + rowHeight / 2;

    fireEvent.pointerDown(sourceRow, {
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: sourceCenterY,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(document, {
      buttons: 1,
      clientX: 20,
      clientY: targetCenterY + 8,
      isPrimary: true,
      pointerId: 1,
    });

    await waitFor(() => expect(sourceRow.className).toContain('dragging'));
    expect(sourceRow.className).not.toContain('drag-source-placeholder');
    expect(fileList.contains(sourceRow)).toBe(true);
    const overlay = document.querySelector('.file-item-drag-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement?.classList.contains('file-drag-overlay-layer')).toBe(true);

    fireEvent.pointerUp(document, {
      button: 0,
      buttons: 0,
      clientX: 20,
      clientY: targetCenterY + 8,
      isPrimary: true,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(document.querySelector('.file-item-drag-overlay')).toBeNull();
    });
    expect(sourceRow.className).not.toContain('dragging');
    expect(fileList.contains(sourceRow)).toBe(true);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
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

  it('renders a top-anchored toggle icon that toggles the rail', () => {
    const onToggleCollapse = vi.fn();
    const { rerender } = render(
      <FileRail
        {...defaultProps}
        onToggleCollapse={onToggleCollapse}
        activePanel="tools"
        onActivePanelChange={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle.classList.contains('rail-toggle')).toBe(true);

    // Toggle icon sits at the top of the selection bar.
    const tabsNav = document.querySelector('.file-rail-tabs')!;
    expect(tabsNav.firstElementChild).toBe(toggle);

    fireEvent.click(toggle);
    expect(onToggleCollapse).toHaveBeenCalledOnce();

    // Collapsed rail keeps the toggle icon visible for re-expansion.
    rerender(
      <FileRail
        {...defaultProps}
        collapsed
        onToggleCollapse={onToggleCollapse}
        activePanel="tools"
        onActivePanelChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeDefined();
  });

  it('restores the last focused panel when re-expanded via the toggle icon', () => {
    const onToggleCollapse = vi.fn();
    const onActivePanelChange = vi.fn();
    const { rerender } = render(
      <FileRail
        {...defaultProps}
        collapsed
        onToggleCollapse={onToggleCollapse}
        activePanel="tools"
        onActivePanelChange={onActivePanelChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalledOnce();
    expect(onActivePanelChange).not.toHaveBeenCalled();

    rerender(
      <FileRail
        {...defaultProps}
        onToggleCollapse={onToggleCollapse}
        activePanel="tools"
        onActivePanelChange={onActivePanelChange}
      />,
    );
    expect(screen.getByRole('tabpanel', { name: 'Tools' })).toBeDefined();
  });
});
