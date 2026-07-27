import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ScoreCardHeader } from '../ScoreCardHeader';

describe('ScoreCardHeader Component', () => {
  const defaultProps = {
    title: 'Test Symphony No. 5',
    zoom: 100,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    anchorContext: 'm. 1-4',
    buildStatus: 'valid' as const,
    saveState: 'Saved',
    editorVisible: false,
    onToggleEditor: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the score view switch and Figma toolbar actions', () => {
    render(<ScoreCardHeader {...defaultProps} />);

    expect(screen.getByText('Test Symphony No. 5')).toBeDefined();
    expect(screen.getByText('Score')).toBeDefined();
    expect(screen.getByText('ABC code')).toBeDefined();
    expect(screen.queryByText('Annotate')).toBeNull();
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText('m. 1-4')).toBeDefined();
  });

  it('handles zoom and editor controls', () => {
    render(<ScoreCardHeader {...defaultProps} />);

    const zoomOutBtn = screen.getByTitle('Zoom out');
    fireEvent.click(zoomOutBtn);
    expect(defaultProps.onZoomOut).toHaveBeenCalledTimes(1);

    const zoomInBtn = screen.getByTitle('Zoom in');
    fireEvent.click(zoomInBtn);
    expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);

    const resetZoomBtn = screen.getByText('Fit');
    fireEvent.click(resetZoomBtn);
    expect(defaultProps.onResetZoom).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('ABC code'));
    expect(defaultProps.onToggleEditor).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Score'));
    expect(defaultProps.onToggleEditor).toHaveBeenCalledTimes(1);
  });

  it('closes the editor from the Score tab', () => {
    render(<ScoreCardHeader {...defaultProps} editorVisible />);

    fireEvent.click(screen.getByText('Score'));
    expect(defaultProps.onToggleEditor).toHaveBeenCalledTimes(1);
  });
});
