/**
 * Auto-scroll utility for centering playing lines in score viewports.
 */

export const easeInOutQuad = (t: number): number => (
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
);

export const calculateCenterScrollTop = (
  container: HTMLElement,
  cursorEl: Element,
): number => {
  const cursorRect = cursorEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const lineCenterY = cursorRect.top + cursorRect.height / 2;
  const containerCenterY = containerRect.top + containerRect.height / 2;
  const deltaY = lineCenterY - containerCenterY;

  const targetScrollTop = container.scrollTop + deltaY;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

  return Math.max(0, Math.min(maxScroll, targetScrollTop));
};

export interface SmoothScrollController {
  cancel: () => void;
}

export const animateScrollTo = (
  container: HTMLElement,
  targetScrollTop: number,
  durationMs = 500,
  onComplete?: () => void,
): SmoothScrollController => {
  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  if (Math.abs(distance) < 1 || durationMs <= 0) {
    container.scrollTop = targetScrollTop;
    onComplete?.();
    return { cancel: () => {} };
  }

  const startTime = performance.now();
  let animationFrameId: number | null = null;
  let cancelled = false;

  const step = (currentTime: number) => {
    if (cancelled) return;

    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const ease = easeInOutQuad(progress);

    container.scrollTop = startScrollTop + distance * ease;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      animationFrameId = null;
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(step);

  return {
    cancel: () => {
      cancelled = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
  };
};
