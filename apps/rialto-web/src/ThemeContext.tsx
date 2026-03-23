import { createContext, useContext } from "react";

interface ThemeContextValue {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  onThemeToggle: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}
