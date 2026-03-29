import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Stack, Text, Button, GlobalNav } from "@mbe/rialto";
import { useTheme, resolveTheme } from "./hooks/use-theme";
import { LoadingPage } from "./pages/LoadingPage";
import styles from "./App.module.css";

/**
 * Root layout route — handles auth gating before any child routes render.
 * Used as the top-level `element` in createBrowserRouter so that
 * route matching (including basename stripping) happens BEFORE auth checks.
 */
export function App() {
  const { isLoading, isAuthenticated, error } = useAuth();
  const { theme: preference, setTheme } = useTheme();
  const resolved = resolveTheme(preference);

  const handleThemeToggle = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  const nav = <GlobalNav currentApp="hospitality" theme={resolved} onThemeToggle={handleThemeToggle} />;

  if (isLoading) {
    return (
      <>
        {nav}
        <LoadingPage />
      </>
    );
  }

  // If on the callback path, show loading while OIDC finishes processing
  const isCallback = window.location.pathname.endsWith("/callback");

  if (error) {
    return (
      <>
        {nav}
        <div className={styles.loginContainer}>
          <Stack gap="md" align="center">
            <Text as="h1" variant="display" color="primary">
              Authentication Error
            </Text>
            <Text variant="body" color="secondary">
              {error.message}
            </Text>
            <Button variant="primary" onClick={() => window.location.assign("/hospitality")}>
              Try Again
            </Button>
          </Stack>
        </div>
      </>
    );
  }

  if (isCallback && !isAuthenticated) {
    return (
      <>
        {nav}
        <LoadingPage />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {nav}
        <LoginPrompt />
      </>
    );
  }

  return (
    <>
      {nav}
      <Outlet />
    </>
  );
}

function LoginPrompt() {
  const { signIn } = useAuth();

  return (
    <div className={styles.loginContainer}>
      <Stack gap="md" align="center">
        <Text as="h1" variant="display" color="primary">
          Hospitality
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
