/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "@mattbutlerengineering/rialto/styles";
import "./global.css";
import {
  RialtoProvider,
  ToastProvider,
  ErrorBoundary,
  unregisterStaleServiceWorkers,
  useThemeState,
} from "@mattbutlerengineering/rialto";

import { initSentry, handleErrorBoundary } from "@mbe/observability/sentry/react";
import { ThemeContext } from "./ThemeContext";
import { routeTree } from "./routes";

initSentry({
  appName: "rialto-web",
  dsn: import.meta.env.VITE_SENTRY_DSN,
});

// Unregister stale service workers (e.g. from previous misconfigured builds)
unregisterStaleServiceWorkers();

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 */
const router = createBrowserRouter(routeTree, { basename: "/rialto" });

/* ── Root component ───────────────────────────── */
function Root() {
  const { theme, toggleTheme } = useThemeState();

  return (
    // RialtoProvider MUST wrap RouterProvider (outside it)
    <RialtoProvider theme={theme}>
      <ErrorBoundary onError={handleErrorBoundary}>
        <ThemeContext value={{ theme, onThemeToggle: toggleTheme }}>
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
