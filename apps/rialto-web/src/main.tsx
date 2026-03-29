/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode, useState, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "@mbe/rialto/styles";
import "./global.css";
import { RialtoProvider, ToastProvider } from "@mbe/rialto";
import { ThemeContext } from "./ThemeContext";
import { routeTree } from "./routes";

/* ── Theme persistence ────────────────────────── */
const THEME_KEY = "mbe-theme-preference";

type ThemePreference = "light" | "dark" | "system";

function getStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable
  }
  return "system";
}

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 */
const router = createBrowserRouter(routeTree, { basename: "/rialto" });

/* ── Root component ───────────────────────────── */
function Root() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme);
  const resolved = resolveTheme(preference);

  const handleThemeToggle = useCallback(() => {
    setPreference((current) => {
      const currentResolved = resolveTheme(current);
      const next: ThemePreference = currentResolved === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Theme still works in memory
      }
      return next;
    });
  }, []);

  const themeContextValue = useMemo(
    () => ({ theme: resolved, onThemeToggle: handleThemeToggle }),
    [resolved, handleThemeToggle]
  );

  return (
    // RialtoProvider MUST wrap RouterProvider (outside it)
    <RialtoProvider theme={resolved}>
      <ThemeContext value={themeContextValue}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeContext>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
