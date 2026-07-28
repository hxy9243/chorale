import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { SheetMusicView } from '../SheetMusicView';

// Mock abcjs
vi.mock('abcjs', () => ({
  default: {
    renderAbc: vi.fn().mockImplementation((container: HTMLElement) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '800');
      svg.setAttribute('height', '1200');
      const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      cursor.classList.add('abcjs-playback-cursor');
      svg.appendChild(cursor);
      container.appendChild(svg);
      return [{ getBpm: () => 120, getTotalTime: () => 60 }];
    }),
  },
}));

describe('Auto-Centering Playing Line with User Scroll Override', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-centers container to top 33% focus area when playback cursor moves', () => {
    const getPlaybackPosition = () => ({ currentSeconds: 5, isPlaying: true });

    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });

    const { container } = render(
      <div className="score-canvas" style={{ height: 400, overflowY: 'auto' }}>
        <SheetMusicView abcCode="X:1\nT:Test\nK:C\nCDEF|GABc|" getPlaybackPosition={getPlaybackPosition} />
      </div>
    );

    const scoreCanvas = container.querySelector('.score-canvas') as HTMLElement;
    const cursor = container.querySelector('.abcjs-playback-cursor') as SVGLineElement;

    expect(scoreCanvas).toBeTruthy();
    expect(cursor).toBeTruthy();

    Object.defineProperty(scoreCanvas, 'scrollHeight', { value: 1000, writable: true });
    scoreCanvas.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 } as DOMRect);
    cursor.getBoundingClientRect = () => ({ top: 500, bottom: 540, height: 40 } as DOMRect);

    // Fire cursor move event while playing
    act(() => {
      window.dispatchEvent(new CustomEvent('chorale-playback-state', { detail: { isPlaying: true } }));
      window.dispatchEvent(new CustomEvent('chorale-playback-cursor', { detail: {} }));
    });

    // Advance animation frame for 400ms smooth scroll to new line position
    act(() => {
      vi.advanceTimersByTime(400);
      if (rafCallback) (rafCallback as (t: number) => void)(performance.now());
    });

    // Line center: 520, Focus Y: 232, Delta: 288 -> target scrollTop set to 288
    expect(scoreCanvas.scrollTop).toBe(288);
  });

  it('pauses auto-centering for 2s on user scroll, then smoothly scrolls back to line in 500ms', () => {
    const getPlaybackPosition = () => ({ currentSeconds: 5, isPlaying: true });

    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });

    const { container } = render(
      <div className="score-canvas" style={{ height: 400, overflowY: 'auto' }}>
        <SheetMusicView abcCode="X:1\nT:Test\nK:C\nCDEF|GABc|" getPlaybackPosition={getPlaybackPosition} />
      </div>
    );

    const scoreCanvas = container.querySelector('.score-canvas') as HTMLElement;
    const cursor = container.querySelector('.abcjs-playback-cursor') as SVGLineElement;

    Object.defineProperty(scoreCanvas, 'scrollHeight', { value: 1000, writable: true });
    scoreCanvas.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 } as DOMRect);
    cursor.getBoundingClientRect = () => ({ top: 500, bottom: 540, height: 40 } as DOMRect);

    act(() => {
      window.dispatchEvent(new CustomEvent('chorale-playback-state', { detail: { isPlaying: true } }));
      window.dispatchEvent(new CustomEvent('chorale-playback-cursor', { detail: {} }));
      vi.advanceTimersByTime(400);
      if (rafCallback) (rafCallback as (t: number) => void)(performance.now());
    });

    expect(scoreCanvas.scrollTop).toBe(288);

    // Simulate user scroll event (wheel)
    act(() => {
      fireEvent.wheel(scoreCanvas, { deltaY: -100 });
    });

    // Change cursor location to a new line (Line center: 620, Delta: 620 - 232 = 388)
    cursor.getBoundingClientRect = () => ({ top: 600, bottom: 640, height: 40 } as DOMRect);

    // Fire cursor move event while user scroll pause is active
    act(() => {
      window.dispatchEvent(new CustomEvent('chorale-playback-cursor', { detail: {} }));
    });

    // Should NOT have jumped immediately during the 2s pause
    expect(scoreCanvas.scrollTop).toBe(288);

    // Advance timer by 2000ms pause
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(window.requestAnimationFrame).toHaveBeenCalled();

    // Fast-forward animation frame by advancing timer by 500ms
    act(() => {
      vi.advanceTimersByTime(500);
      if (rafCallback) (rafCallback as (t: number) => void)(performance.now());
    });

    // target is 676 (initial 288 + delta 388) after smooth scroll finishes
    expect(scoreCanvas.scrollTop).toBe(676);
  });
});
