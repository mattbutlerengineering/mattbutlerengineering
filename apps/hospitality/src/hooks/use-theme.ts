import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useThemeState as useSharedThemeState } from "@mattbutlerengineering/rialto";

export { resolveTheme } from "@mattbutlerengineering/rialto";
export type { ThemePreference, ThemeState } from "@mattbutlerengineering/rialto";
import type { ThemePreference } from "@mattbutlerengineering/rialto";

/** Must match rialto's `useThemeState` storage key (packages/rialto/src/hooks/useThemeState.ts). */
const THEME_STORAGE_KEY = "mbe-theme-preference";

function hasStoredThemePreference(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  } catch {
    // Storage unavailable — treat as "has one" so we never overwrite silently.
    return true;
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

/** Consume the current theme preference from context. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * State hook for the provider in main.tsx.
 * Reads the initial value from localStorage and persists changes back.
 */
export function useThemeState(): ThemeContextValue {
  const { preference, setTheme } = useSharedThemeState();

  return useMemo(
    () => ({
      theme: preference,
      setTheme,
    }),
    [preference, setTheme]
  );
}

/**
 * Hydrates the local theme from the server-saved preference once, only when
 * no local preference has ever been set on this device. Never overwrites an
 * explicit local choice — that includes a choice made while `serverTheme` was
 * still loading, since that write lands in localStorage immediately.
 */
export function useThemeServerHydration(serverTheme: ThemePreference | undefined): void {
  const { setTheme } = useTheme();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (hasStoredThemePreference()) {
      hydratedRef.current = true;
      return;
    }
    if (!serverTheme) return;
    hydratedRef.current = true;
    setTheme(serverTheme);
  }, [serverTheme, setTheme]);
}
