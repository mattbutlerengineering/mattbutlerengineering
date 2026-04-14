import "@mattbutlerengineering/rialto/styles";
import "./index.css";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { ErrorBoundary, RialtoProvider, Text, ToastProvider } from "@mattbutlerengineering/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { App, CallbackRedirect } from "./App";

// Lazy-loaded route components — each becomes its own chunk
const PlaygroundPage = lazy(() =>
  import("./pages/PlaygroundPage.js").then((m) => ({ default: m.PlaygroundPage }))
);
const SharedSpecPage = lazy(() =>
  import("./pages/SharedSpecPage.js").then((m) => ({ default: m.SharedSpecPage }))
);

function LoadingFallback() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <Text variant="body" color="secondary">Loading...</Text>
    </div>
  );
}

// Auth config from environment
const authConfig = {
  authority: import.meta.env.VITE_AUTH_AUTHORITY ?? "",
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "",
  redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? window.location.origin + "/gen/callback",
  audience: import.meta.env.VITE_AUTH_AUDIENCE,
};

/**
 * Bridge component that reads theme from ThemeContext and passes it to
 * RialtoProvider. Must be a child of ThemeProvider to call useTheme().
 */
function ThemedApp() {
  const { theme } = useTheme();

  return (
    <RialtoProvider theme={theme}>
      <ToastProvider>
        <AuthProvider config={authConfig}>
          <ErrorBoundary>
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
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </StrictMode>
);
