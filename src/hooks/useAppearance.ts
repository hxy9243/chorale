import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  applyAppearance, HALL_KEY, readAppearance, resolveTheme, saveAppearance,
  systemPrefersDark, THEME_KEY, STUDIO_ACCENT_KEY, type HallColor, type ThemePreference, type StudioAccent,
} from '../utils/appearance';

export function useAppearance() {
  const [preferences, setPreferences] = useState(readAppearance);
  const [dark, setDark] = useState(systemPrefersDark);

  useLayoutEffect(() => { applyAppearance(preferences, dark); }, [preferences, dark]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystem = (event: MediaQueryListEvent) => setDark(event.matches);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_KEY || event.key === HALL_KEY || event.key === STUDIO_ACCENT_KEY) setPreferences(readAppearance());
    };
    query?.addEventListener('change', handleSystem);
    window.addEventListener('storage', handleStorage);
    return () => {
      query?.removeEventListener('change', handleSystem);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const changeTheme = useCallback((theme: ThemePreference) => {
    const next = { ...preferences, theme };
    setPreferences(next);
    saveAppearance(next);
  }, [preferences]);
  const changeHall = useCallback((hall: HallColor) => {
    const next = { ...preferences, hall };
    setPreferences(next);
    saveAppearance(next);
  }, [preferences]);
  const changeStudioAccent = useCallback((studioAccent: StudioAccent) => {
    const next = { ...preferences, studioAccent };
    setPreferences(next);
    saveAppearance(next);
  }, [preferences]);

  return { ...preferences, resolvedTheme: resolveTheme(preferences.theme, dark), changeTheme, changeHall, changeStudioAccent };
}
