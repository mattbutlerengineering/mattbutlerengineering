/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode, useState, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "@mbe/rialto/styles";
import "./global.css";
import { RialtoProvider, ToastProvider, ErrorBoundary } from "@mbe/rialto";
import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
import { ThemeContext } from "./ThemeContext";
import { routeTree } from "./routes";

initSentry({
  appName: "rialto-web",
  dsn: import.meta.env.VITE_SENTRY_DSN,
});

// Unregister stale service workers. A previous build registered the hospitality
// SW at scope "/" instead of "/hospitality/", causing rialto pages to redirect
// to /hospitality for returning visitors. Clears any SW not scoped to /hospitality/.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (!registration.scope.includes("/hospitality/")) {
        void registration.unregister();
      }
    }
  });
}

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
      <ErrorBoundary onError={handleErrorBoundary}>
        <ThemeContext value={themeContextValue}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ThemeContext>
      </ErrorBoundary>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
