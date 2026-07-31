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
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only the floating score display actions', () => {
    render(<ScoreCardHeader {...defaultProps} />);

    expect(screen.getByText('Test Symphony No. 5')).toBeDefined();
    expect(screen.getByLabelText('Score display options')).toBeDefined();
    expect(screen.queryByText('Score')).toBeNull();
    expect(screen.queryByText('ABC code')).toBeNull();
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('handles zoom controls', () => {
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
  });

  it('surfaces the translucent controls while the score is scrolling', () => {
    const { unmount } = render(
      <section className="score-workspace-card">
        <ScoreCardHeader {...defaultProps} />
      </section>,
    );

    const controls = screen.getByLabelText('Score display options');
    expect(controls.className).not.toContain('is-scrolling');
    fireEvent.wheel(controls);
    expect(controls.className).toContain('is-scrolling');
    unmount();
  });
});
