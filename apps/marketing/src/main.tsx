/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import "@mattbutlerengineering/rialto/styles";
import "./global.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RialtoProvider, ErrorBoundary, ToastProvider, unregisterStaleServiceWorkers } from "@mattbutlerengineering/rialto";
import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
import { App } from "./App";

initSentry({
  appName: "marketing",
  dsn: import.meta.env.VITE_SENTRY_DSN,
});

// Unregister stale service workers (e.g. from previous misconfigured builds)
unregisterStaleServiceWorkers();

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

/* ── Root component ───────────────────────────── */
function Root() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme);
  const resolved = resolveTheme(preference);

  const handleThemeToggle = () => {
    const next: ThemePreference = resolved === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Theme still works in memory
    }
    setPreference(next);
  };

  return (
    // RialtoProvider MUST wrap BrowserRouter (outside it)
    <RialtoProvider theme={resolved}>
      <ToastProvider>
        <ErrorBoundary onError={handleErrorBoundary}>
          <BrowserRouter>
            <App theme={resolved} onThemeToggle={handleThemeToggle} />
          </BrowserRouter>
        </ErrorBoundary>
      </ToastProvider>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
