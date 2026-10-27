import "@mattbutlerengineering/rialto/styles";
import "./index.css";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router";
import { ErrorBoundary, RialtoProvider, Text, ToastProvider } from "@mattbutlerengineering/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
import { App, CallbackRedirect } from "./App";
import { buildGenAuthConfig } from "./auth-config.js";

initSentry({
  appName: "gen",
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});

// Lazy-loaded route components — each becomes its own chunk
const PlaygroundPage = lazy(() =>
  import("./pages/PlaygroundPage.js").then((m) => ({ default: m.PlaygroundPage }))
);
const SharedSpecPage = lazy(() =>
  import("./pages/SharedSpecPage.js").then((m) => ({ default: m.SharedSpecPage }))
);

function LoadingFallback() {
  return (
    <div
      style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}
    >
      <Text variant="body" color="secondary">
        Loading...
      </Text>
    </div>
  );
}

// Auth config from environment. Sign-out returns to /gen (an Allowed Logout
// URL), not /gen/callback, which Auth0 rejects with HTTP 400.
const authConfig = buildGenAuthConfig(
  {
    authority: import.meta.env.VITE_AUTH_AUTHORITY,
    clientId: import.meta.env.VITE_AUTH_CLIENT_ID,
    redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI,
    audience: import.meta.env.VITE_AUTH_AUDIENCE,
  },
  window.location.origin
);

/** Theme persistence and live OS tracking are owned by RialtoProvider (`persistTheme`). */
function ThemedApp() {
  return (
    <RialtoProvider persistTheme>
      <ToastProvider>
        <AuthProvider config={authConfig}>
          <ErrorBoundary onError={handleErrorBoundary}>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </RialtoProvider>
  );
}

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 */
const router = createBrowserRouter(
  [
    {
      element: <App />,
      children: [
        { path: "callback", element: <CallbackRedirect /> },
        {
          index: true,
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <PlaygroundPage />
            </Suspense>
          ),
        },
        {
          path: "s/:id",
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <SharedSpecPage />
            </Suspense>
          ),
        },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/gen" }
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>
);
