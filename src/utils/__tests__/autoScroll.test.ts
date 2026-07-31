import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  easeOutCubic,
  calculateCenterScrollTop,
  animateScrollTo,
} from '../autoScroll';

describe('autoScroll utils', () => {
  describe('easeOutCubic', () => {
    it('returns 0 at progress 0 and 1 at progress 1', () => {
      expect(easeOutCubic(0)).toBe(0);
      expect(easeOutCubic(1)).toBe(1);
    });

    it('moves quickly, then settles monotonically without overshoot', () => {
      expect(easeOutCubic(0.25)).toBeCloseTo(0.578125);
      expect(easeOutCubic(0.5)).toBe(0.875);
      expect(easeOutCubic(0.75)).toBeCloseTo(0.984375);
      expect(easeOutCubic(0.75)).toBeLessThan(easeOutCubic(1));
    });
  });

  describe('calculateCenterScrollTop', () => {
    it('calculates exact target scroll top to center cursor line in container', () => {
      const container = {
        scrollTop: 100,
        clientHeight: 400,
        scrollHeight: 1000,
        getBoundingClientRect: () => ({ top: 100, bottom: 500, height: 400 } as DOMRect),
      } as unknown as HTMLElement;

      const cursorEl = {
        getBoundingClientRect: () => ({ top: 400, bottom: 440, height: 40 } as DOMRect),
      } as unknown as Element;

      // Line center Y: 400 + 20 = 420
      // Container focus Y (0.33): 100 + 400 * 0.33 = 232
      // Delta: 420 - 232 = +188
      // Target: 100 + 188 = 288
      const target = calculateCenterScrollTop(container, cursorEl);
      expect(target).toBe(288);
    });

    it('clamps target scroll top within 0 and max scroll height', () => {
      const container = {
        scrollTop: 0,
        clientHeight: 400,
        scrollHeight: 500,
        getBoundingClientRect: () => ({ top: 0, bottom: 400, height: 400 } as DOMRect),
      } as unknown as HTMLElement;

      const cursorEl = {
        getBoundingClientRect: () => ({ top: 600, bottom: 640, height: 40 } as DOMRect),
      } as unknown as Element;

      // Target scroll would be high, but max scroll is 500 - 400 = 100
      const target = calculateCenterScrollTop(container, cursorEl);
      expect(target).toBe(100);
    });
  });

  describe('animateScrollTo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('animates scroll top smoothly over durationMs', () => {
      const container = {
        scrollTop: 0,
      } as unknown as HTMLElement;

      let rafCallback: ((time: number) => void) | null = null;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallback = cb;
        return 1;
      });

      const onComplete = vi.fn();
      const controller = animateScrollTo(container, 200, 500, onComplete);

      expect(container.scrollTop).toBe(0);

      // Simulate half-way frame (250ms)
      if (rafCallback) (rafCallback as (t: number) => void)(250);
      expect(container.scrollTop).toBe(175); // 200 * 0.875

      // Simulate completion frame (500ms)
      if (rafCallback) (rafCallback as (t: number) => void)(500);
      expect(container.scrollTop).toBe(200);
      expect(onComplete).toHaveBeenCalledTimes(1);

      controller.cancel();
    });

    it('allows cancelling animation prematurely', () => {
      const container = {
        scrollTop: 0,
      } as unknown as HTMLElement;

      let rafCallback: ((time: number) => void) | null = null;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallback = cb;
        return 1;
      });
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

      const controller = animateScrollTo(container, 200, 500);
      controller.cancel();

      expect(cancelSpy).toHaveBeenCalledWith(1);

      // Step shouldn't update container after cancel
      if (rafCallback) (rafCallback as (t: number) => void)(250);
      expect(container.scrollTop).toBe(0);
    });
  });
});
