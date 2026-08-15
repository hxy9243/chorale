import { describe, expect, it } from 'vitest';
import { shouldEmptyElectronOutput } from '../../vite.main.config';

describe('Electron main build output', () => {
  it('preserves the preload bundle during watch builds', () => {
    expect(shouldEmptyElectronOutput(['vite', 'build', '--watch'])).toBe(false);
  });

  it('cleans stale artifacts during production builds', () => {
    expect(shouldEmptyElectronOutput(['vite', 'build'])).toBe(true);
  });
});
