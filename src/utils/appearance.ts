export const THEME_KEY = 'chorale.workspace.theme';
export const HALL_KEY = 'chorale.workspace.hall';
export const STUDIO_ACCENT_KEY = 'chorale.workspace.studioAccent';
export const THEMES = ['recital', 'studio', 'system'] as const;
export const HALLS = ['charcoal', 'walnut', 'velvet', 'conservatory'] as const;
export const STUDIO_ACCENTS = ['linen', 'sage', 'clay', 'lavender'] as const;
export type ThemePreference = typeof THEMES[number];
export type HallColor = typeof HALLS[number];
export type StudioAccent = typeof STUDIO_ACCENTS[number];
export interface AppearancePreferences { theme: ThemePreference; hall: HallColor; studioAccent: StudioAccent }
export const DEFAULT_APPEARANCE: AppearancePreferences = { theme: 'recital', hall: 'charcoal', studioAccent: 'linen' };

export function readAppearance(): AppearancePreferences {
  try {
    const theme = window.localStorage.getItem(THEME_KEY);
    const hall = window.localStorage.getItem(HALL_KEY);
    const studioAccent = window.localStorage.getItem(STUDIO_ACCENT_KEY);
    return {
      theme: THEMES.includes(theme as ThemePreference) ? theme as ThemePreference : DEFAULT_APPEARANCE.theme,
      hall: HALLS.includes(hall as HallColor) ? hall as HallColor : DEFAULT_APPEARANCE.hall,
      studioAccent: STUDIO_ACCENTS.includes(studioAccent as StudioAccent) ? studioAccent as StudioAccent : DEFAULT_APPEARANCE.studioAccent,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
}

export function resolveTheme(theme: ThemePreference, dark = systemPrefersDark()): 'recital' | 'studio' {
  return theme === 'system' ? dark ? 'recital' : 'studio' : theme;
}

export function applyAppearance(preferences: AppearancePreferences, dark = systemPrefersDark()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(preferences.theme, dark);
  document.documentElement.dataset.hall = preferences.hall;
  document.documentElement.dataset.studioAccent = preferences.studioAccent;
}

export function saveAppearance(preferences: AppearancePreferences): void {
  try {
    window.localStorage.setItem(THEME_KEY, preferences.theme);
    window.localStorage.setItem(HALL_KEY, preferences.hall);
    window.localStorage.setItem(STUDIO_ACCENT_KEY, preferences.studioAccent);
  } catch { /* A display preference must never prevent the workspace from opening. */ }
}
