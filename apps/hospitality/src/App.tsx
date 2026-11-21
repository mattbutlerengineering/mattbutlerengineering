import { lazy, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Outlet, Navigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Suspense } from "react";
import { useAuthGate, signinReturnTo } from "@mbe/auth/react";
import type { AuthGate } from "@mbe/auth/react";
import { Text, Footer } from "@mattbutlerengineering/rialto";
import { siteCopyright, siteFooterColumns } from "@mbe/site-nav";
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

// The signed-out landing is a long, animated page that staff never see once
// signed in, so it stays out of the main bundle.
const ShowcaseLanding = lazy(() =>
  import("./components/showcase/ShowcaseLanding.js").then((m) => ({ default: m.ShowcaseLanding }))
);

type NavSky = "light" | "dark" | null;

/**
 * Shared shell for all unauthenticated views (loading, error, login).
 * Renders the skip-link, nav, main content, and a minimal footer.
 */
function UnauthenticatedShell({
  nav,
  children,
  landing = false,
}: {
  readonly nav: ReactNode;
  readonly children: ReactNode;
  /** The showcase landing: a full-width scrolling page, not a centred card. */
  readonly landing?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={landing ? styles.landingLayout : styles.unauthLayout}>
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipToMain")}
      </a>
      {nav}
      <main
        id="main-content"
        tabIndex={-1}
        className={landing ? styles.landingContainer : styles.loginContainer}
      >
        {children}
      </main>
      {currentHostConfig().standalone ? (
        <Footer variant="minimal" className={styles.footer}>
          <Text>{t("shell.copyright", { year: new Date().getFullYear() })}</Text>
        </Footer>
      ) : (
        <Footer
          variant="rich"
          className={styles.footer}
          logo={<Text>{currentHostConfig().brand.logo}</Text>}
          columns={siteFooterColumns()}
          copyright={siteCopyright(new Date().getFullYear())}
        />
      )}
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
 * A signed-out visitor at the app's root gets the showcase landing. Everyone
 * else who is signed out keeps the plain sign-in gate: a deep link is staff on
 * their way somewhere, a sign-out round-trip deserves its "you're signed out"
 * line, and a standalone host (eat-sheet.com) is the product's own brand, not
 * a place to pitch Matt's work.
 */
function showsShowcaseLanding(
  gate: Exclude<AuthGate, { phase: "ready" }>,
  pathname: string
): boolean {
  return (
    gate.phase === "signed-out" &&
    !gate.afterSignOut &&
    pathname === "/" &&
    !currentHostConfig().standalone
  );
}

/**
 * Root layout route — handles auth gating before any child routes render.
 * Used as the top-level `element` in createBrowserRouter so that
 * route matching (including basename stripping) happens BEFORE auth checks.
 */
export function App() {
  const gate = useAuthGate();
  const { pathname } = useLocation();
  const [navSky, setNavSky] = useState<NavSky>(null);

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

  // The showcase landing lends the nav its own light (day, then night) through
  // `navSky`. `display: contents` keeps the nav sticky against the layout.
  const nav = (
    <div className={styles.navSky} data-nav-sky data-theme={navSky ?? undefined}>
      <AppNav host={currentHostConfig()} theme={resolved} onThemeToggle={handleThemeToggle} />
    </div>
  );

  // The gate ORDER (which phase for which lifecycle facts + URL) is owned by
  // @mbe/auth's useAuthGate; this component only maps phase → screen.
  if (gate.phase !== "ready") {
    if (showsShowcaseLanding(gate, pathname)) {
      return (
        <UnauthenticatedShell nav={nav} landing>
          <Suspense fallback={<LoadingPage />}>
            <ShowcaseLanding onSkyChange={setNavSky} />
          </Suspense>
        </UnauthenticatedShell>
      );
    }
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
