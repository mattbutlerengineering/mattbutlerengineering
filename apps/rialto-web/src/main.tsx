/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@mattbutlerengineering/rialto/styles";
import "./global.css";
import {
  RialtoProvider,
  ToastProvider,
  ErrorBoundary,
  unregisterStaleServiceWorkers,
  useTheme,
} from "@mattbutlerengineering/rialto";

import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
import { ThemeContext } from "./ThemeContext";
import { routeTree } from "./routes";

initSentry({
  appName: "rialto-web",
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});

// Unregister stale service workers (e.g. from previous misconfigured builds)
unregisterStaleServiceWorkers();

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 */
const router = createBrowserRouter(routeTree, { basename: "/rialto" });

/* ── Root component ───────────────────────────── */
function ThemeBridge({ children }: { children: ReactNode }) {
  return <ThemeContext value={useTheme()}>{children}</ThemeContext>;
}

function Root() {
  return (
    // RialtoProvider MUST wrap RouterProvider (outside it)
    <RialtoProvider persistTheme>
      <ErrorBoundary onError={handleErrorBoundary}>
        <ThemeBridge>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ThemeBridge>
      </ErrorBoundary>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
