/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import "@mattbutlerengineering/rialto/styles";
import "./global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  RialtoProvider,
  ErrorBoundary,
  ToastProvider,
  unregisterStaleServiceWorkers,
  useThemeState,
} from "@mattbutlerengineering/rialto";
import { initSentry, handleErrorBoundary } from "@mbe/observability/sentry/react"; // eslint-disable-line no-restricted-imports
import { App } from "./App";

initSentry({
  appName: "marketing",
  dsn: import.meta.env.VITE_SENTRY_DSN,
});

// Unregister stale service workers (e.g. from previous misconfigured builds)
unregisterStaleServiceWorkers();

/* ── Root component ───────────────────────────── */
function Root() {
  const { theme, toggleTheme } = useThemeState();

  return (
    // RialtoProvider MUST wrap BrowserRouter (outside it)
    <RialtoProvider theme={theme}>
      <ToastProvider>
        <ErrorBoundary onError={handleErrorBoundary}>
          <BrowserRouter>
            <App theme={theme} onThemeToggle={toggleTheme} />
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
