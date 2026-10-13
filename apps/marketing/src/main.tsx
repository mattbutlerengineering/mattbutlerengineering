/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import "@mattbutlerengineering/rialto/styles";
import "./global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import {
  RialtoProvider,
  ErrorBoundary,
  ToastProvider,
  unregisterStaleServiceWorkers,
  useTheme,
} from "@mattbutlerengineering/rialto";

import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
import { QueryProvider } from "./providers/QueryProvider.js";
import { App } from "./App";

initSentry({
  appName: "marketing",
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});

// Unregister stale service workers (e.g. from previous misconfigured builds)
unregisterStaleServiceWorkers();

/* ── Root component ───────────────────────────── */
function ThemedApp() {
  const { theme, toggleTheme } = useTheme();
  return <App theme={theme} onThemeToggle={toggleTheme} />;
}

function Root() {
  return (
    // RialtoProvider MUST wrap BrowserRouter (outside it).
    // `presenting` vibe: more whitespace + softer radii for the marketing surface.
    <RialtoProvider persistTheme vibe="presenting">
      <ToastProvider>
        <ErrorBoundary onError={handleErrorBoundary}>
          <QueryProvider>
            <BrowserRouter>
              <ThemedApp />
            </BrowserRouter>
          </QueryProvider>
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
