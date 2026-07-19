import { beforeAll } from 'vitest';

beforeAll(() => {
  // Ensure DOMParser is present on window and global
  if (typeof window !== 'undefined' && !window.DOMParser) {
    window.DOMParser = (globalThis as any).DOMParser;
  }
});
