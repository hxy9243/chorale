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
});
