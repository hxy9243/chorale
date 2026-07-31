import { render, screen, fireEvent } from '@testing-library/react';
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

  it('uses direction-aware whole-row drop targets and keyboard reordering', () => {
    const onReorderDocument = vi.fn();
    render(<FileRail {...defaultProps} onReorderDocument={onReorderDocument} />);

    const source = screen.getByRole('button', { name: `Reorder ${doc1.name}` });
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest('.file-item')!;
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      setDragImage: vi.fn(),
      getData: vi.fn(() => doc1.id),
    };

    target.getBoundingClientRect = () => ({
      top: 100,
      bottom: 164,
      height: 64,
    } as DOMRect);
    fireEvent.dragStart(source, { dataTransfer });
    expect(source.closest('.file-item')?.className).toContain('dragging');
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    fireEvent.dragOver(target, { dataTransfer, clientY: 150 });
    expect(target.className).toContain('drop-after');
    fireEvent.drop(target, { dataTransfer, clientY: 150 });

    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
    fireEvent.keyDown(source, { key: 'ArrowDown' });
    expect(onReorderDocument).toHaveBeenLastCalledWith(doc1.id, doc2.id, 'after');

    const upwardSource = screen.getByRole('button', { name: `Reorder ${doc2.name}` });
    const upwardTarget = screen.getByRole('button', { name: 'Open Bach Minuet' }).closest('.file-item')!;
    const upwardDataTransfer = {
      ...dataTransfer,
      getData: vi.fn(() => doc2.id),
    };
    upwardTarget.getBoundingClientRect = () => ({
      top: 200,
      bottom: 264,
      height: 64,
    } as DOMRect);
    fireEvent.dragStart(upwardSource, { dataTransfer: upwardDataTransfer });
    fireEvent.dragOver(upwardTarget, { dataTransfer: upwardDataTransfer, clientY: 210 });
    expect(upwardTarget.className).toContain('drop-before');
    fireEvent.drop(upwardTarget, { dataTransfer: upwardDataTransfer, clientY: 210 });
    expect(onReorderDocument).toHaveBeenLastCalledWith(doc2.id, doc1.id, 'before');
    expect(screen.queryByLabelText(`Move ${doc1.name} down`)).toBeNull();
  });

  it('accepts a drop in trailing list space and keeps the source row visible', () => {
    const onReorderDocument = vi.fn();
    const { container } = render(
      <FileRail {...defaultProps} onReorderDocument={onReorderDocument} />,
    );
    const source = screen.getByRole('button', { name: `Reorder ${doc1.name}` });
    const fileList = container.querySelector('.file-list')!;
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      setDragImage: vi.fn(),
      getData: vi.fn(() => doc1.id),
    };

    fireEvent.dragStart(source, { dataTransfer });
    expect(source.closest('.file-item')?.className).toContain('dragging');
    fireEvent.dragOver(fileList, { dataTransfer });
    fireEvent.drop(fileList, { dataTransfer });

    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
  });
});
