import { useState, useCallback, useMemo } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "mbe-theme-preference";

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "system";
}

function storeTheme(theme: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Theme still works in memory
  }
}

/** Resolve a preference to a concrete light/dark value. */
export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly theme: "light" | "dark";
  readonly setTheme: (next: ThemePreference) => void;
  readonly toggleTheme: () => void;
}

/**
 * State hook for theme management.
 * Reads initial value from localStorage and persists changes.
 */
export function useThemeState(): ThemeState {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredTheme);

  const setTheme = useCallback((next: ThemePreference) => {
    storeTheme(next);
    setPreferenceState(next);
  }, []);

  const theme = useMemo(() => resolveTheme(preference), [preference]);

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = theme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [theme, setTheme]);

  return { preference, theme, setTheme, toggleTheme };
}
