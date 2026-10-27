import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAppearance, DEFAULT_APPEARANCE, HALL_KEY, readAppearance, resolveTheme, saveAppearance, STUDIO_ACCENT_KEY, THEME_KEY } from '../appearance';

beforeEach(() => window.localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.hall; delete document.documentElement.dataset.studioAccent; });

describe('appearance preferences', () => {
  it('defaults to Recital Charcoal and rejects unknown stored choices', () => {
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    window.localStorage.setItem(THEME_KEY, 'dark');
    window.localStorage.setItem(HALL_KEY, 'slate');
    window.localStorage.setItem(STUDIO_ACCENT_KEY, 'unknown');
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
  it('persists hall identity while switching to Studio', () => {
    saveAppearance({ theme: 'studio', hall: 'velvet', studioAccent: 'sage' });
    applyAppearance(readAppearance());
    expect(document.documentElement.dataset).toMatchObject({ theme: 'studio', hall: 'velvet', studioAccent: 'sage' });
    saveAppearance({ ...readAppearance(), theme: 'recital' });
    expect(readAppearance()).toEqual({ theme: 'recital', hall: 'velvet', studioAccent: 'sage' });
  });
  it('resolves Match system while explicit preferences ignore the system', () => {
    expect(resolveTheme('system', true)).toBe('recital');
    expect(resolveTheme('system', false)).toBe('studio');
    expect(resolveTheme('recital', false)).toBe('recital');
    expect(resolveTheme('studio', true)).toBe('studio');
  });
  it('can open the workspace when preference storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(() => saveAppearance({ ...DEFAULT_APPEARANCE, hall: 'walnut' })).not.toThrow();
  });
});
