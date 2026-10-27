import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';
import { HALL_KEY, STUDIO_ACCENT_KEY, THEME_KEY } from '../../utils/appearance';

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.hall; delete document.documentElement.dataset.studioAccent; });
const openSettings = () => render(<SettingsModal open onClose={() => {}} interfaceZoom={100} onInterfaceZoomChange={() => {}} />);

describe('Appearance settings', () => {
  it('switches between theme palettes and keeps the selected hall', () => {
    openSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Walnut' }));
    expect(document.documentElement.dataset.hall).toBe('walnut');
    expect(window.localStorage.getItem(HALL_KEY)).toBe('walnut');
    fireEvent.click(screen.getByRole('radio', { name: /Studio/ }));
    expect(document.documentElement.dataset.theme).toBe('studio');
    expect(screen.queryByRole('group', { name: 'Hall color' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Accent color' })).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: /Recital/ }));
    expect(document.documentElement.dataset).toMatchObject({ theme: 'recital', hall: 'walnut' });
  });
  it('persists the Studio accent independently of the Recital hall', () => {
    const view = openSettings();
    fireEvent.click(screen.getByRole('radio', { name: /Studio/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sage' }));
    expect(document.documentElement.dataset.studioAccent).toBe('sage');
    expect(window.localStorage.getItem(STUDIO_ACCENT_KEY)).toBe('sage');
    fireEvent.click(screen.getByRole('radio', { name: /Recital/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Velvet' }));
    fireEvent.click(screen.getByRole('radio', { name: /Studio/ }));
    expect((screen.getByRole('radio', { name: 'Sage' }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.hall).toBe('velvet');
    view.unmount();
    openSettings();
    expect((screen.getByRole('radio', { name: 'Sage' }) as HTMLInputElement).checked).toBe(true);
  });
  it('follows system changes only when Match system is selected', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false,
      addEventListener: (_type: string, callback: typeof listener) => { listener = callback; }, removeEventListener,
    })));
    const { unmount } = openSettings();
    fireEvent.click(screen.getByRole('radio', { name: /Match system/ }));
    expect(document.documentElement.dataset.theme).toBe('studio');
    act(() => listener?.({ matches: true }));
    expect(document.documentElement.dataset.theme).toBe('recital');
    fireEvent.click(screen.getByRole('radio', { name: /Studio/ }));
    act(() => listener?.({ matches: true }));
    expect(document.documentElement.dataset.theme).toBe('studio');
    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });
  it('receives display preference updates from another window', () => {
    openSettings();
    window.localStorage.setItem(THEME_KEY, 'studio');
    window.localStorage.setItem(HALL_KEY, 'conservatory');
    window.localStorage.setItem(STUDIO_ACCENT_KEY, 'lavender');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY })));
    expect(document.documentElement.dataset).toMatchObject({ theme: 'studio', hall: 'conservatory', studioAccent: 'lavender' });
    expect((screen.getByRole('radio', { name: /Studio/ }) as HTMLInputElement).checked).toBe(true);
    window.localStorage.setItem(STUDIO_ACCENT_KEY, 'clay');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: STUDIO_ACCENT_KEY })));
    expect((screen.getByRole('radio', { name: 'Clay' }) as HTMLInputElement).checked).toBe(true);
  });
});
