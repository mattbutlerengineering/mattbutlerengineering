import { createContext, useContext } from "react";
import type { ThemePreference, ThemeState } from "@mattbutlerengineering/rialto";

const DEFAULT_CONTEXT: ThemeState = {
  preference: "system",
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
};

export const ThemeContext = createContext<ThemeState>(DEFAULT_CONTEXT);

export function useThemeContext(): ThemeState {
  return useContext(ThemeContext);
}

export type { ThemePreference, ThemeState };
