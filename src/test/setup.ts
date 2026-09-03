import { beforeAll } from 'vitest';

beforeAll(() => {
  // Ensure DOMParser is present on window and global
  if (typeof window !== 'undefined' && !window.DOMParser) {
    window.DOMParser = (globalThis as any).DOMParser;
  }

  // Polyfill ResizeObserver for JSDOM
  if (typeof window !== 'undefined' && !window.ResizeObserver) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = MockResizeObserver as any;
    (globalThis as any).ResizeObserver = MockResizeObserver as any;
  }

  // Polyfill scrollTo and scrollIntoView for JSDOM
  if (typeof Element !== 'undefined') {
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = () => {};
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
  }
});
