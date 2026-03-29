import { createContext, useContext, useState, useCallback } from "react";

type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "mbe-theme-preference";

function getStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return "system";
}

function storeTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Theme still works in memory for the session
  }
}

/* ── Context ────────────────────────────────────── */

export interface ThemeContextValue {
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

/* ── Hooks ──────────────────────────────────────── */

/** Resolve a preference to a concrete light/dark value. */
export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/** Consume the current theme preference from context. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * State hook for the provider in main.tsx.
 * Reads the initial value from localStorage and persists changes back.
 */
export function useThemeState(): ThemeContextValue {
  const [theme, setThemeState] = useState<ThemePreference>(getStoredTheme);

  const setTheme = useCallback((next: ThemePreference) => {
    storeTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
