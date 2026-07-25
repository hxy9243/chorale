import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoreCardHeader } from '../ScoreCardHeader';

describe('ScoreCardHeader Component', () => {
  const defaultProps = {
    title: 'Test Symphony No. 5',
    zoom: 100,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    anchorContext: 'm. 1-4',
  };

  it('renders score title, status pills, and zoom controls', () => {
    render(<ScoreCardHeader {...defaultProps} />);

    expect(screen.getByText('Test Symphony No. 5')).toBeDefined();
    expect(screen.getByText('Saved')).toBeDefined();
    expect(screen.getByText('Ready')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText('m. 1-4')).toBeDefined();
  });


  it('handles zoom button clicks', () => {
    render(<ScoreCardHeader {...defaultProps} />);

    const zoomInBtn = screen.getByLabelText('Zoom In');
    fireEvent.click(zoomInBtn);
    expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);

    const zoomOutBtn = screen.getByLabelText('Zoom Out');
    fireEvent.click(zoomOutBtn);
    expect(defaultProps.onZoomOut).toHaveBeenCalledTimes(1);

    const resetZoomBtn = screen.getByText('100%');
    fireEvent.click(resetZoomBtn);
    expect(defaultProps.onResetZoom).toHaveBeenCalledTimes(1);
  });
});
