import { createContext, useContext, useMemo } from "react";
import { useThemeState as useSharedThemeState } from "@mattbutlerengineering/rialto";

export { resolveTheme } from "@mattbutlerengineering/rialto";
export type { ThemePreference, ThemeState } from "@mattbutlerengineering/rialto";
import type { ThemePreference } from "@mattbutlerengineering/rialto";

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
