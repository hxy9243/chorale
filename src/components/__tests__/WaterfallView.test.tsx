import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaterfallView } from '../WaterfallView';
import type { WaterfallPlayback } from '../../music/waterfallPlayback';

describe('WaterfallView', () => {
  let nextFrame: FrameRequestCallback;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 42; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  it('uses shared clock for onset, held keys, pause, resume and arbitrary seeks', () => {
    let position = { currentSeconds: 0, isPlaying: true };
    const playback: WaterfallPlayback = {
      notes: [{ id: 'a', midiPitch: 60, voice: 0, onsetSeconds: 1, durationSeconds: 2 }, { id: 'b', midiPitch: 64, voice: 1, onsetSeconds: 1, durationSeconds: 1 }],
      getPosition: () => position,
    };
    const { container, unmount } = render(<WaterfallView playback={playback} />);
    const active = (pitch: number) => container.querySelector(`[data-pitch="${pitch}"]`)?.getAttribute('data-active');
    expect(active(60)).toBe('false');
    position = { currentSeconds: 1, isPlaying: true };
    act(() => nextFrame(0));
    expect(active(60)).toBe('true');
    expect(active(64)).toBe('true');
    position = { currentSeconds: 2, isPlaying: true };
    act(() => nextFrame(1));
    expect(active(60)).toBe('true');
    expect(active(64)).toBe('false');
    const y = container.querySelector('[data-note="a"]')?.getAttribute('y');
    position = { currentSeconds: 2, isPlaying: false };
    act(() => nextFrame(2));
    expect(active(60)).toBe('false');
    expect(container.querySelector('[data-note="a"]')?.getAttribute('y')).toBe(y);
    position = { currentSeconds: 2, isPlaying: true };
    act(() => nextFrame(3));
    expect(active(60)).toBe('true');
    position = { currentSeconds: 0, isPlaying: false };
    act(() => nextFrame(4));
    expect(active(60)).toBe('false');
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });
  it('clears stale notes when the score is replaced and explains the empty state', () => {
    const { rerender, container } = render(<WaterfallView playback={{ notes: [{ id: 'old', midiPitch: 61, voice: 0, onsetSeconds: 0, durationSeconds: 3 }], getPosition: () => ({ currentSeconds: 1, isPlaying: true }) }} />);
    expect(container.querySelector('[data-note="old"]')).not.toBeNull();
    rerender(<WaterfallView playback={null} />);
    expect(container.querySelector('[data-note="old"]')).toBeNull();
    expect(screen.getByText('Waiting for score audio…')).toBeDefined();
  });
  it('matches the contact width to white and black notes and confines sparks to the merge point', () => {
    let position = { currentSeconds: 0.5, isPlaying: true };
    const playback: WaterfallPlayback = {
      notes: [
        { id: 'white', midiPitch: 60, voice: 0, onsetSeconds: 1, durationSeconds: 2 },
        { id: 'black', midiPitch: 61, voice: 1, onsetSeconds: 1, durationSeconds: 2 },
      ],
      getPosition: () => position,
    };
    const { container } = render(<WaterfallView playback={playback} />);
    expect(container.querySelector('[data-contact]')).toBeNull();
    expect(container.querySelector('.waterfall-tail-particle')).toBeNull();

    position = { currentSeconds: 1.2, isPlaying: true };
    act(() => nextFrame(0));
    const railY = Number(container.querySelector('.waterfall-keyboard-rail')?.getAttribute('y1'));
    for (const id of ['white', 'black']) {
      const note = container.querySelector(`[data-note="${id}"]`)!;
      const contact = container.querySelector(`[data-contact="${id}"]`)!;
      const glow = contact.querySelector('.waterfall-contact-glow')!;
      const seam = contact.querySelector('.waterfall-contact-seam')!;
      for (const element of [glow, seam]) {
        expect(element.getAttribute('x')).toBe(note.getAttribute('x'));
        expect(element.getAttribute('width')).toBe(note.getAttribute('width'));
      }
      // Rounded leading caps extend beneath the keyboard clip during merging.
      expect(Number(note.getAttribute('y')) + Number(note.getAttribute('height'))).toBeGreaterThan(railY);
      expect(note.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const sparks = contact.querySelectorAll('.waterfall-splash-particle');
      expect(sparks.length).toBeGreaterThan(7);
      expect(sparks.length).toBeLessThanOrEqual(24);
      for (const spark of sparks) {
        expect(Number(spark.getAttribute('x1'))).toBeGreaterThanOrEqual(Number(note.getAttribute('x')));
        expect(Number(spark.getAttribute('x1'))).toBeLessThanOrEqual(Number(note.getAttribute('x')) + Number(note.getAttribute('width')));
        expect(Number(spark.getAttribute('y2'))).toBeGreaterThan(railY - 15);
        expect(Number(spark.getAttribute('y1'))).toBeLessThan(railY);
        expect(Number(spark.getAttribute('stroke-width'))).toBeLessThanOrEqual(1.05);
      }
    }
    const originalSparks = container.querySelector('.waterfall-contacts')?.innerHTML;
    position = { currentSeconds: 2.5, isPlaying: true };
    act(() => nextFrame(1));
    expect(container.querySelector('.waterfall-contacts')?.innerHTML).not.toBe(originalSparks);
    position = { currentSeconds: 1.2, isPlaying: true };
    act(() => nextFrame(2));
    expect(container.querySelector('.waterfall-contacts')?.innerHTML).toBe(originalSparks);
    position = { currentSeconds: 1.2, isPlaying: false };
    act(() => nextFrame(3));
    expect(container.querySelector('[data-contact]')).toBeNull();
    position = { currentSeconds: 3, isPlaying: true };
    act(() => nextFrame(4));
    expect(container.querySelector('[data-contact]')).toBeNull();
    expect(container.querySelector('[data-note]')).toBeNull();
  });
  it('anchors fading tails to the complete note interval through clipping, merging and seeks', () => {
    let position = { currentSeconds: 0, isPlaying: true };
    const playback: WaterfallPlayback = {
      notes: [{ id: 'long', midiPitch: 60, voice: 0, onsetSeconds: 1, durationSeconds: 8 }],
      getPosition: () => position,
    };
    const { container } = render(<WaterfallView playback={playback} />);
    const gradient = () => container.querySelector('linearGradient[gradientUnits="userSpaceOnUse"]')!;
    const originalLength = Number(gradient().getAttribute('y2')) - Number(gradient().getAttribute('y1'));
    expect(Number(gradient().getAttribute('y1'))).toBeLessThan(0);
    expect(gradient().querySelector('stop')?.getAttribute('stop-opacity')).toBe('0');
    for (const currentSeconds of [1, 4, 8.8, 0]) {
      position = { currentSeconds, isPlaying: true };
      act(() => nextFrame(currentSeconds));
      expect(Number(gradient().getAttribute('y2')) - Number(gradient().getAttribute('y1'))).toBeCloseTo(originalLength);
      expect(container.querySelector('[data-note="long"]')?.getAttribute('y')).toBe(gradient().getAttribute('y1'));
    }
  });
});
