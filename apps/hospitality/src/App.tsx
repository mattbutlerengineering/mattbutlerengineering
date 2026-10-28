import { useEffect } from "react";
import type { ReactNode } from "react";
import { Outlet, Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Suspense } from "react";
import { useAuthGate, signinReturnTo } from "@mbe/auth/react";
import type { AuthGate } from "@mbe/auth/react";
import { Text, Footer } from "@mattbutlerengineering/rialto";
import { AppNav } from "./components/AppNav.js";
import { currentHostConfig } from "./lib/host-brand.js";
import { useTheme, useThemeServerHydration } from "./hooks/use-theme";
import { useCurrentUser } from "./hooks/useUsers.js";
import { LoadingPage } from "./pages/LoadingPage";
import { LoginGate } from "./components/LoginGate";
import { CallbackPage } from "./components/CallbackPage";
import { SessionExpiredGate } from "./components/SessionExpiredGate";
import { AuthFailurePage } from "./pages/AuthFailurePage";
import { SignOutPage } from "./pages/SignOutPage";
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
  const { t } = useTranslation();
  return (
    <div className={styles.unauthLayout}>
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipToMain")}
      </a>
      {nav}
      <main id="main-content" tabIndex={-1} className={styles.loginContainer}>
        {children}
      </main>
      <Footer variant="minimal" className={styles.footer}>
        <Text>{t("shell.copyright", { year: new Date().getFullYear() })}</Text>
      </Footer>
    </div>
  );
}

/**
 * Hydrates the local theme from the server-saved preference once the current
 * user resolves — see `useThemeServerHydration`. Renders nothing; only
 * mounted once a user is authenticated, so `/users/me` is never fetched
 * ahead of a token.
 */
function ThemeServerSync() {
  const { data: user } = useCurrentUser();
  useThemeServerHydration(user?.preferences.theme);
  return null;
}

/** The screen for each not-yet-ready auth gate phase. */
function unauthenticatedScreen(gate: Exclude<AuthGate, { phase: "ready" }>): ReactNode {
  switch (gate.phase) {
    case "signing-out":
      return <SignOutPage />;
    case "loading":
      return <LoadingPage />;
    // The wait is a credential exchange, not a generic load — show the handshake.
    case "callback":
      return <CallbackPage />;
    case "error":
      return <AuthFailurePage error={gate.error} lane={gate.onCallback ? 1 : 0} />;
    // A lapsed session deserves a "your session ended" moment, not a cold gate.
    case "expired":
      return <SessionExpiredGate />;
    case "signed-out":
      return <LoginGate signedOut={gate.afterSignOut} />;
  }
}

/**
 * Root layout route — handles auth gating before any child routes render.
 * Used as the top-level `element` in createBrowserRouter so that
 * route matching (including basename stripping) happens BEFORE auth checks.
 */
export function App() {
  const gate = useAuthGate();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main && !window.location.hash) {
      main.focus({ preventScroll: true });
    }
  }, []);
  const { resolvedTheme: resolved, setTheme } = useTheme();

  const handleThemeToggle = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  const nav = (
    <AppNav host={currentHostConfig()} theme={resolved} onThemeToggle={handleThemeToggle} />
  );

  // The gate ORDER (which phase for which lifecycle facts + URL) is owned by
  // @mbe/auth's useAuthGate; this component only maps phase → screen.
  if (gate.phase !== "ready") {
    return <UnauthenticatedShell nav={nav}>{unauthenticatedScreen(gate)}</UnauthenticatedShell>;
  }

  return (
    <div className={styles.authLayout} data-testid="auth-layout">
      <ThemeServerSync />
      {nav}
      <Suspense fallback={<LoadingPage />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

/**
 * Redirect helper for the callback route — after successful auth, navigates
 * to the deep link carried through sign-in, or home when none was carried.
 * The value originates from the attacker-influenceable OIDC state param;
 * `signinReturnTo` re-validates it against open redirects.
 */
export function CallbackRedirect() {
  return <Navigate to={signinReturnTo()} replace />;
}
