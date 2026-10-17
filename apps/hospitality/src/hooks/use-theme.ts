import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useTheme as useRialtoTheme, THEME_STORAGE_KEY } from "@mattbutlerengineering/rialto";

export { resolveTheme } from "@mattbutlerengineering/rialto";
export type { ThemePreference } from "@mattbutlerengineering/rialto";
import type { ThemePreference } from "@mattbutlerengineering/rialto";

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
  /** The stored preference (`"system"` included). */
  readonly theme: ThemePreference;
  /** The preference resolved to light/dark; follows the OS live while `theme` is `"system"`. */
  readonly resolvedTheme: "light" | "dark";
  readonly setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

/* ── Hooks ──────────────────────────────────────── */

/** Consume the current theme preference from context. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Adapts the theme state owned by `<RialtoProvider persistTheme>` to this
 * app's context shape. Call it from inside the provider (see main.tsx).
 */
export function useThemeState(): ThemeContextValue {
  const { preference, theme: resolvedTheme, setTheme } = useRialtoTheme();

  return useMemo(
    () => ({
      theme: preference,
      resolvedTheme,
      setTheme,
    }),
    [preference, resolvedTheme, setTheme]
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
