import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Stack, Text, Button } from "@mbe/rialto";
import styles from "./App.module.css";

/**
 * Root layout route — handles auth gating before any child routes render.
 * Used as the top-level `element` in createBrowserRouter so that
 * route matching (including basename stripping) happens BEFORE auth checks.
 */
export function App() {
  const { isLoading, isAuthenticated, error } = useAuth();

  if (isLoading) {
    return (
      <div className={styles.loginContainer}>
        <Text variant="body" color="secondary">
          Loading...
        </Text>
      </div>
    );
  }

  // If on the callback path, show loading while OIDC finishes processing
  const isCallback = window.location.pathname.endsWith("/callback");
  // Bypass auth gate for shared spec permalinks (/gen/s/:id)
  const isSharedSpec = window.location.pathname.includes("/gen/s/");

  if (error) {
    return (
      <div className={styles.loginContainer}>
        <Stack gap="md" align="center">
          <Text as="h1" variant="display" color="primary">
            Authentication Error
          </Text>
          <Text variant="body" color="secondary">
            {error.message}
          </Text>
          <Button variant="primary" onClick={() => window.location.assign("/gen")}>
            Try Again
          </Button>
        </Stack>
      </div>
    );
  }

  if (isCallback && !isAuthenticated) {
    return (
      <div className={styles.loginContainer}>
        <Text variant="body" color="secondary">
          Loading...
        </Text>
      </div>
    );
  }

  if (isSharedSpec) {
    return <Outlet />;
  }

  if (!isAuthenticated) {
    return <LoginPrompt />;
  }

  return <Outlet />;
}

function LoginPrompt() {
  const { signIn } = useAuth();

  return (
    <div className={styles.loginContainer}>
      <Stack gap="md" align="center">
        <Text as="h1" variant="display" color="primary">
          Gen Playground
        </Text>
        <Text variant="body" color="secondary">
          Please sign in to continue
        </Text>
        <Button variant="primary" onClick={() => signIn()}>
          Sign In
        </Button>
      </Stack>
    </div>
  );
}

/**
 * Redirect helper for the callback route — after successful auth,
 * navigates to home.
 */
export function CallbackRedirect() {
  return <Navigate to="/" replace />;
}
