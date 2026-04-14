import { RouterProvider } from "react-router-dom";
import { ErrorBoundary, RialtoProvider, ToastProvider } from "@mattbutlerengineering/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { useTheme } from "./contexts/ThemeContext";
import { router } from "./router";

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
export function ThemedApp() {
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
