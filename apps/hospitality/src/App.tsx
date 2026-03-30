import type { ReactNode } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Stack, Text, Button, GlobalNav, Footer } from "@mbe/rialto";
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
      <main id="main-content" className={styles.loginContainer}>
        {children}
      </main>
      <Footer variant="minimal" className={styles.footer}>
        <span>&copy; {new Date().getFullYear()} Matt Butler Engineering</span>
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
  const { theme: preference, setTheme } = useTheme();
  const resolved = resolveTheme(preference);

  const handleThemeToggle = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  const nav = <GlobalNav currentApp="hospitality" theme={resolved} onThemeToggle={handleThemeToggle} />;

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
    <>
      {nav}
      <Outlet />
    </>
  );
}

function LoginPrompt() {
  const { signIn } = useAuth();

  return (
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
  );
}

/**
 * Redirect helper for the callback route — after successful auth,
 * navigates to home.
 */
export function CallbackRedirect() {
  return <Navigate to="/" replace />;
}
