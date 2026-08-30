import { useEffect } from "react";
import type { ReactNode } from "react";
import { Outlet, Navigate } from "react-router";
import { Suspense } from "react";
import { useAuth, isSafeReturnTo } from "@mbe/auth/react";
import { Stack, Text, Button, GlobalNav, Footer } from "@mattbutlerengineering/rialto";
import { useTheme, resolveTheme } from "./hooks/use-theme";
import { LoadingPage } from "./pages/LoadingPage";
import { LoginGate } from "./components/LoginGate";
import { describeAuthError } from "./lib/describe-auth-error";
import { readReturnTo } from "./return-to-store";
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
    const described = describeAuthError(error);
    return (
      <UnauthenticatedShell nav={nav}>
        <Stack gap="lg" align="center">
          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              {described.title}
            </Text>
            <Text variant="body" color="secondary">
              {described.body}
            </Text>
          </Stack>
          {described.canRetry && (
            <Button variant="primary" onClick={() => window.location.assign("/hospitality")}>
              Try Again
            </Button>
          )}
          {/* Raw message stays reachable for debugging, demoted below the fold. */}
          <details className={styles.errorDetails}>
            <summary>Technical details</summary>
            <Text variant="caption" color="tertiary">
              {error.message}
            </Text>
          </details>
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
        <LoginGate />
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

/**
 * Redirect helper for the callback route — after successful auth, navigates
 * to the deep link preserved through sign-in (see return-to-store), or home
 * when none was carried. The stored value originates from the OIDC state
 * param, which is attacker-influenceable, so it is re-validated against open
 * redirects before navigating.
 */
export function CallbackRedirect() {
  const returnTo = readReturnTo();
  return <Navigate to={isSafeReturnTo(returnTo) ? returnTo : "/"} replace />;
}
