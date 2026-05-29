import { useEffect } from "react";
import type { ReactNode } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { useAuth } from "@mbe/auth/react";
import { Stack, Text, Button, GlobalNav, Footer } from "@mattbutlerengineering/rialto";
import { useTheme, resolveTheme } from "./hooks/use-theme";
import { LoadingPage } from "./pages/LoadingPage";
import styles from "./App.module.css";

/**
 * Shared shell for all unauthenticated views (loading, error, login).
 * Renders the skip-link, nav, main content, and a minimal footer.
 */
function UnauthenticatedShell({
  nav,
  children,
}: {
  readonly nav: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.unauthLayout}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      {nav}
      <main id="main-content" tabIndex={-1} className={styles.loginContainer}>
        {children}
      </main>
      <Footer variant="minimal" className={styles.footer}>
        <Text>&copy; {new Date().getFullYear()} Matt Butler</Text>
      </Footer>
    </div>
  );
}

/**
 * Root layout route — handles auth gating before any child routes render.
 * Used as the top-level `element` in createBrowserRouter so that
 * route matching (including basename stripping) happens BEFORE auth checks.
 */
export function App() {
  const { isLoading, isAuthenticated, error } = useAuth();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main && !window.location.hash) {
      main.focus({ preventScroll: true });
    }
  }, []);
  const { theme: preference, setTheme } = useTheme();
  const resolved = resolveTheme(preference);

  const handleThemeToggle = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  const nav = (
    <GlobalNav currentApp="hospitality" theme={resolved} onThemeToggle={handleThemeToggle} />
  );

  if (isLoading) {
    return (
      <UnauthenticatedShell nav={nav}>
        <LoadingPage />
      </UnauthenticatedShell>
    );
  }

  // If on the callback path, show loading while OIDC finishes processing
  const isCallback = window.location.pathname.endsWith("/callback");

  if (error) {
    return (
      <UnauthenticatedShell nav={nav}>
        <Stack gap="lg" align="center">
          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              Authentication Error
            </Text>
            <Text variant="body" color="secondary">
              {error.message}
            </Text>
          </Stack>
          <Button variant="primary" onClick={() => window.location.assign("/hospitality")}>
            Try Again
          </Button>
        </Stack>
      </UnauthenticatedShell>
    );
  }

  if (isCallback && !isAuthenticated) {
    return (
      <UnauthenticatedShell nav={nav}>
        <LoadingPage />
      </UnauthenticatedShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <UnauthenticatedShell nav={nav}>
        <LoginPrompt />
      </UnauthenticatedShell>
    );
  }

  return (
    <div className={styles.authLayout} data-testid="auth-layout">
      {nav}
      <Suspense fallback={<LoadingPage />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

function LoginPrompt() {
  const { signIn } = useAuth();

  return (
    <Stack gap="lg" align="center" data-testid="login-prompt">
      <Stack gap="sm" align="center">
        <Text as="h1" variant="display" color="primary">
          Hospitality
        </Text>
        <Text variant="body" color="secondary">
          Restaurant management, simplified.
        </Text>
      </Stack>
      <Button variant="primary" size="lg" onClick={() => signIn()}>
        Sign In
      </Button>
      <Text variant="caption" color="tertiary">
        Manage reservations, guests, and floor plans
      </Text>
    </Stack>
  );
}

/**
 * Redirect helper for the callback route — after successful auth,
 * navigates to home.
 */
export function CallbackRedirect() {
  return <Navigate to="/" replace />;
}
