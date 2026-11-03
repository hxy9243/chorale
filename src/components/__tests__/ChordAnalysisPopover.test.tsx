import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordAnalysisPopover } from '../ChordAnalysisPopover';

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
});
afterEach(() => { vi.restoreAllMocks(); document.querySelector('[data-test-surface]')?.remove(); });

const setup = (zoom = 100) => {
  let measureTop = 430, surfaceLeft = 360, surfaceWidth = 900;
  const surface = document.createElement('div'); surface.dataset.testSurface = 'true';
  surface.innerHTML = '<svg><rect class="abcjs-measure-hit-area" data-measure="4"/><g data-annotation-id="chord-4" tabindex="0"/></svg>';
  document.body.append(surface);
  const initiator = surface.querySelector<SVGElement>('g')!;
  const hit = surface.querySelector<SVGElement>('rect')!;
  vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => rect(surfaceLeft, 100, surfaceWidth, 650));
  vi.spyOn(initiator, 'getBoundingClientRect').mockImplementation(() => rect(920, measureTop - 30, 72, 28));
  vi.spyOn(hit, 'getBoundingClientRect').mockImplementation(() => rect(900, measureTop, 120, 110));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('chord-analysis-popover') ? rect(0, 0, 320, 220) : rect(0, 0, 0, 0);
  });
  const onClose = vi.fn(), initiatorRef = { current: initiator as HTMLElement | SVGElement | null };
  const view = render(<ChordAnalysisPopover annotationId="chord-4" measure={4} initiatorRef={initiatorRef}
    surfaceRef={{ current: surface }} interfaceZoom={zoom} layoutVersion="1" onClose={onClose}>
    <p>Chord interpretation</p><button>Keep as annotation</button>
  </ChordAnalysisPopover>);
  return { ...view, surface, initiator, onClose, panel: screen.getByLabelText('Chord analysis popover'),
    move: (top: number) => { measureTop = top; }, resize: (left: number, width: number) => { surfaceLeft = left; surfaceWidth = width; } };
};

describe('chord analysis popover', () => {
  it('floats at the left edge of the score beside the measure without entering the score layout', () => {
    const { panel, surface } = setup();
    expect(panel.parentElement).toBe(document.body);
    expect(surface.contains(panel)).toBe(false);
    expect(panel.style.left).toBe('372px'); expect(panel.style.top).toBe('430px');
    expect(document.activeElement).toBe(panel);
  });
  it('tracks scrolling and dismisses when the measure leaves the visible score', async () => {
    const { panel, surface, move, onClose } = setup();
    move(280); fireEvent.scroll(surface);
    await waitFor(() => expect(panel.style.top).toBe('280px'));
    move(800); fireEvent.scroll(surface);
    await waitFor(() => expect(onClose).toHaveBeenCalledWith());
  });
  it('clamps long details to the panel edge and accounts for interface zoom', async () => {
    const { panel, resize, move } = setup(150);
    resize(10, 250); move(720); fireEvent(window, new Event('resize'));
    await waitFor(() => expect(Number.parseFloat(panel.style.width)).toBeCloseTo(250 / 1.5 - 24));
    expect(Number.parseFloat(panel.style.top) * 1.5 + 220).toBeLessThanOrEqual(742);
    expect(Number.parseFloat(panel.style.left) * 1.5).toBeGreaterThanOrEqual(8);
  });
  it('preserves internal interactions and dismisses with Escape or outside interaction', () => {
    const { panel, initiator, onClose } = setup();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Keep as annotation' }));
    fireEvent.pointerDown(initiator); expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(panel, { key: 'Escape' }); expect(onClose).toHaveBeenLastCalledWith(true);
    fireEvent.pointerDown(document.body); expect(onClose).toHaveBeenLastCalledWith();
  });
});
