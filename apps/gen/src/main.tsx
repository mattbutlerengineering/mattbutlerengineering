import "@mbe/rialto/styles";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { RialtoProvider } from "@mbe/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { App, CallbackRedirect } from "./App";

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
      <AuthProvider config={authConfig}>
        <RouterProvider router={router} />
      </AuthProvider>
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
          element: <PlaygroundPage />,
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
