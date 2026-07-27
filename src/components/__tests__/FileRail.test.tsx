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

  it('renders a files-only sidebar', () => {
    render(<FileRail {...defaultProps} />);

    expect(screen.getByText('Import score')).toBeDefined();
    expect(screen.getByText('FILES')).toBeDefined();
    expect(screen.queryByText('LIBRARY')).toBeNull();
    expect(screen.queryByText('PROJECTS')).toBeNull();
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

  it('calls onMoveDocument when move buttons are clicked', () => {
    const onMoveDocument = vi.fn();
    render(<FileRail {...defaultProps} onMoveDocument={onMoveDocument} />);

    const moveDownBtn = screen.getByLabelText(`Move ${doc1.name} down`);
    fireEvent.click(moveDownBtn);
    expect(onMoveDocument).toHaveBeenCalledWith(doc1.id, 'down');

    const moveUpBtn = screen.getByLabelText(`Move ${doc2.name} up`);
    fireEvent.click(moveUpBtn);
    expect(onMoveDocument).toHaveBeenCalledWith(doc2.id, 'up');
  });
});
