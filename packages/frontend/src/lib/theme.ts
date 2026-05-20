// Theme switching: light / dark with user preference persisted in localStorage.
//
// Initial value: whatever the user previously chose, else the OS preference,
// else "light". We write a `data-theme` attribute on <html>, which Tailwind 4's
// CSS variables (see styles/theme.css) react to.

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mafia.theme';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // localStorage may be unavailable (private mode, file://, etc.) — ignore.
  }
  return null;
}

function systemPreference(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyToDom(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Read+apply the initial theme before React mounts, so the page does not flash light
 * theme then switch to dark. Call once from main.tsx — it's safe to call again later
 * (the hook itself will re-apply).
 */
export function bootstrapTheme(): void {
  const theme = readStored() ?? systemPreference();
  applyToDom(theme);
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? systemPreference());

  useEffect(() => {
    applyToDom(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle, set: setTheme };
}
