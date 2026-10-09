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

  it('collapses healthy save, engraving, and playback into Music ready', () => {
    render(
      <Header
        activeFileName="Test.xml"
        saveStatus="saved"
        canRenderScore={true}
        hasPlayback={true}
      />,
    );

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.queryByText('Auto-saved')).toBeNull();
    expect(screen.queryByText('SVG ready')).toBeNull();
    expect(document.querySelectorAll('.header-status-pill')).toHaveLength(1);
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
    expect(screen.queryByText('SVG pending')).toBeNull();
    expect(screen.queryByText('Music pending')).toBeNull();
  });

  it.each([
    { saveStatus: 'error' as const, canRenderScore: true, hasPlayback: true, label: 'Save failed' },
    { saveStatus: 'saved' as const, canRenderScore: false, hasPlayback: true, label: 'Music pending' },
    { saveStatus: 'saved' as const, canRenderScore: true, hasPlayback: false, label: 'Music pending' },
  ])('shows one status for $label', ({ label, ...props }) => {
    render(<Header {...props} />);
    expect(screen.getByRole('status').textContent).toBe(label);
    expect(document.querySelectorAll('.header-status-pill')).toHaveLength(1);
  });

  it('groups all pane toggles on the right beside the status', () => {
    const onToggleSheet = vi.fn(), onToggleEditor = vi.fn(), onToggleWaterfall = vi.fn();
    render(<Header sheetVisible editorVisible={false} waterfallVisible onToggleSheet={onToggleSheet}
      onToggleEditor={onToggleEditor} onToggleWaterfall={onToggleWaterfall} saveStatus="saved" canRenderScore hasPlayback />);
    const group = screen.getByRole('group', { name: 'Pane visibility' });
    expect(group.parentElement?.className).toBe('header-right');
    expect(group.nextElementSibling).toBe(screen.getByRole('status'));
    for (const [label, pressed, callback] of [
      ['Sheet', 'true', onToggleSheet], ['ABC code', 'false', onToggleEditor], ['Waterfall', 'true', onToggleWaterfall],
    ] as const) {
      const button = screen.getByRole('button', { name: label });
      expect(button.getAttribute('aria-pressed')).toBe(pressed);
      fireEvent.click(button);
      expect(callback).toHaveBeenCalledOnce();
    }
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
