import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoreVideoExportModal } from '../ScoreVideoExportModal';

describe('ScoreVideoExportModal', () => {
  beforeEach(() => {
    // Mock HTMLCanvasElement getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      set fillStyle(_val: any) {},
      set strokeStyle(_val: any) {},
      set lineWidth(_val: any) {},
      set font(_val: any) {},
      set textAlign(_val: any) {},
      set textBaseline(_val: any) {},
      set globalAlpha(_val: any) {},
    });
  });

  it('renders correctly when open', () => {
    render(
      <ScoreVideoExportModal
        open={true}
        onClose={vi.fn()}
        scoreTitle="Chorale in C Major"
        composer="J. S. Bach"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Export Sheet Video' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Export Sheet Video' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Export Sheet Video/ })).toBeDefined();
    expect(screen.getByText('16:9 Landscape')).toBeDefined();
    expect(screen.getByText('9:16 Portrait')).toBeDefined();
    expect(screen.getByText('Modern Dark')).toBeDefined();
    expect(screen.getByText('Warm Paper')).toBeDefined();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <ScoreVideoExportModal
        open={false}
        onClose={vi.fn()}
        scoreTitle="Hidden Score"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('toggles aspect ratio and theme selection', () => {
    render(
      <ScoreVideoExportModal
        open={true}
        onClose={vi.fn()}
        scoreTitle="Chorale in C Major"
      />,
    );

    const landscapeBtn = screen.getByText('16:9 Landscape').closest('button')!;
    const portraitBtn = screen.getByText('9:16 Portrait').closest('button')!;

    expect(landscapeBtn.classList.contains('active')).toBe(true);
    expect(portraitBtn.classList.contains('active')).toBe(false);

    fireEvent.click(portraitBtn);
    expect(portraitBtn.classList.contains('active')).toBe(true);
    expect(landscapeBtn.classList.contains('active')).toBe(false);

    const darkBtn = screen.getByText('Modern Dark').closest('button')!;
    const warmBtn = screen.getByText('Warm Paper').closest('button')!;

    expect(darkBtn.classList.contains('active')).toBe(true);
    fireEvent.click(warmBtn);
    expect(warmBtn.classList.contains('active')).toBe(true);
    expect(darkBtn.classList.contains('active')).toBe(false);
  });

  it('toggles play/pause state for preview', () => {
    render(
      <ScoreVideoExportModal
        open={true}
        onClose={vi.fn()}
        scoreTitle="Chorale in C Major"
      />,
    );

    const playBtn = screen.getByLabelText('Play preview');
    fireEvent.click(playBtn);
    expect(screen.getByLabelText('Pause preview')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Pause preview'));
    expect(screen.getByLabelText('Play preview')).toBeDefined();
  });

  it('calls onClose when close or cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ScoreVideoExportModal
        open={true}
        onClose={onClose}
        scoreTitle="Chorale in C Major"
      />,
    );

    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
