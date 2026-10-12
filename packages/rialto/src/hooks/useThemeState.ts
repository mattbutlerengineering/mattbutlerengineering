import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";

/** The one localStorage key every Rialto app persists its theme preference under. */
export const THEME_STORAGE_KEY = "mbe-theme-preference";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/* ── Preference store (localStorage, shared across hook instances and tabs) ── */

const preferenceListeners = new Set<() => void>();
/** Fallback when localStorage is unavailable, so the choice still works in memory. */
let memoryPreference: ThemePreference | null = null;

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(stored)) return stored;
  } catch {
    // localStorage unavailable
  }
  return memoryPreference ?? "system";
}

function getServerPreference(): ThemePreference {
  return "system";
}

function storeTheme(theme: ThemePreference): void {
  memoryPreference = theme;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme still works in memory
  }
}

function subscribePreference(onChange: () => void): () => void {
  preferenceListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/* ── OS color-scheme store ───────────────────── */

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function getOsDark(): boolean {
  return hasMatchMedia() && window.matchMedia(DARK_QUERY).matches;
}

function subscribeOsDark(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Resolve a preference to a concrete light/dark value (snapshot; not reactive). */
export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return getOsDark() ? "dark" : "light";
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
 *
 * Persists the preference to localStorage (one key, {@link THEME_STORAGE_KEY})
 * and shares it across hook instances and browser tabs. A stored `"system"`
 * preference tracks the OS color scheme live, so an OS dark-mode switch is
 * reflected in `theme` without a reload.
 */
export function useThemeState(): ThemeState {
  const preference = useSyncExternalStore(subscribePreference, getStoredTheme, getServerPreference);
  const osDark = useSyncExternalStore(subscribeOsDark, getOsDark, () => false);

  const theme = preference === "system" ? (osDark ? "dark" : "light") : preference;

  const setTheme = useCallback((next: ThemePreference) => {
    storeTheme(next);
    preferenceListeners.forEach((listener) => listener());
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { preference, theme, setTheme, toggleTheme };
}
