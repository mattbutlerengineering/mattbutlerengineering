import { createContext, useContext } from "react";
import type { ThemeState } from "../hooks/useThemeState";

/** Provided by `<RialtoProvider persistTheme>`; `null` anywhere else. */
export const ThemeStateContext = createContext<ThemeState | null>(null);

/**
 * Read and change the persisted theme preference owned by
 * `<RialtoProvider persistTheme>`. `theme` is the resolved light/dark value
 * (live-following the OS while the preference is `"system"`).
 */
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeStateContext);
  if (!ctx) throw new Error("useTheme must be used within <RialtoProvider persistTheme>");
  return ctx;
}
