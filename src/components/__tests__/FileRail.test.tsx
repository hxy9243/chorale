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

  it('renders icon-only tabs and one named panel at a time', () => {
    render(<FileRail {...defaultProps} />);

    const filesTab = screen.getByRole('tab', { name: 'Files' });
    const toolsTab = screen.getByRole('tab', { name: 'Tools' });
    const settingsTab = screen.getByRole('tab', { name: 'Settings' });

    expect(filesTab.textContent).toBe('');
    expect(toolsTab.textContent).toBe('');
    expect(settingsTab.textContent).toBe('');
    expect(filesTab.getAttribute('title')).toBe('Files');
    expect(toolsTab.getAttribute('title')).toBe('Tools');
    expect(settingsTab.getAttribute('title')).toBe('Settings');
    expect(screen.getByText('Import score')).toBeDefined();
    expect(screen.getByRole('tabpanel', { name: 'Files' })).toBeDefined();

    fireEvent.click(toolsTab);
    expect(screen.getByRole('tabpanel', { name: 'Tools' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'ABC display' })).toBeDefined();

    fireEvent.click(settingsTab);
    expect(screen.getByRole('tabpanel', { name: 'Settings' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeDefined();
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

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
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

  it('reorders files by dragging before or after another row', () => {
    const onReorderDocument = vi.fn();
    render(<FileRail {...defaultProps} onReorderDocument={onReorderDocument} />);

    const source = screen.getByRole('button', { name: 'Open Bach Minuet' }).closest('.file-item')!;
    const target = screen.getByRole('button', { name: 'Open Beethoven Ode' }).closest('.file-item')!;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 40,
      bottom: 40,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      getData: vi.fn(() => doc1.id),
    };

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { clientY: 35, dataTransfer });
    expect(target.className).toContain('drop-after');
    fireEvent.drop(target, { clientY: 35, dataTransfer });

    expect(onReorderDocument).toHaveBeenCalledWith(doc1.id, doc2.id, 'after');
    expect(screen.queryByLabelText(`Move ${doc1.name} down`)).toBeNull();
  });
});
