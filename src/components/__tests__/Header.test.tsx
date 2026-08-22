import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../Header';

describe('Header Component', () => {
  it('renders the title and current score without a brand wordmark', () => {
    render(<Header activeFileName="Test Score.xml" />);
    expect(screen.queryByText('Chorale')).toBeNull();
    expect(screen.getByText('Test Score.xml')).toBeDefined();
    expect(document.querySelector('.brand-mark')).toBeNull();
    expect(document.querySelector('.header-left')).toBeNull();
    expect(screen.queryByText('Baroque Studies')).toBeNull();
    expect(screen.queryByText('Share')).toBeNull();
    expect(document.querySelector('.header-chat-button')).toBeNull();
  });

  it('renders SVG ready, Music ready, and save status indicators in the header', () => {
    render(
      <Header
        activeFileName="Test.xml"
        saveStatus="saved"
        canRenderScore={true}
        hasPlayback={true}
      />,
    );

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Auto-saved')).toBeDefined();
    expect(screen.getByText('SVG ready')).toBeDefined();
    expect(screen.getByText('Music ready')).toBeDefined();
  });

  it('renders pending status when score or audio is not ready', () => {
    render(
      <Header
        activeFileName="Test.xml"
        saveStatus="saving"
        canRenderScore={false}
        hasPlayback={false}
      />,
    );

    expect(screen.getByText('Saving…')).toBeDefined();
    expect(screen.getByText('SVG pending')).toBeDefined();
    expect(screen.getByText('Music pending')).toBeDefined();
  });

  it('renders Undo and Redo buttons and handles clicks', () => {
    const handleUndo = vi.fn();
    const handleRedo = vi.fn();

    const { rerender } = render(
      <Header
        activeFileName="Test.xml"
        canUndo={true}
        canRedo={false}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />,
    );

    const undoBtn = screen.getByRole('button', { name: 'Undo last edit' });
    const redoBtn = screen.getByRole('button', { name: 'Redo edit' });

    expect(undoBtn).toBeDefined();
    expect(redoBtn).toBeDefined();
    expect((undoBtn as HTMLButtonElement).disabled).toBe(false);
    expect((redoBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(undoBtn);
    expect(handleUndo).toHaveBeenCalledOnce();

    fireEvent.click(redoBtn);
    expect(handleRedo).not.toHaveBeenCalled();

    rerender(
      <Header
        activeFileName="Test.xml"
        canUndo={false}
        canRedo={true}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />,
    );

    expect((undoBtn as HTMLButtonElement).disabled).toBe(true);
    expect((redoBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(redoBtn);
    expect(handleRedo).toHaveBeenCalledOnce();
  });
});
