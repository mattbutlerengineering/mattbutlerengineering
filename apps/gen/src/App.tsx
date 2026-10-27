import { Outlet, Navigate } from "react-router";
import { useAuth, useAuthGate, signinReturnTo } from "@mbe/auth/react";
import { Stack, Text, Button } from "@mattbutlerengineering/rialto";
import { LoginLanding } from "./components/LoginLanding.js";
import { SiteChrome } from "./components/SiteChrome.js";
import styles from "./App.module.css";

function LoadingScreen() {
  return (
    <div className={styles.loginContainer}>
      <Text variant="body" color="secondary">
        Loading...
      </Text>
    </div>
  );
}

function SessionExpiredScreen() {
  const { signIn } = useAuth();
  return (
    <SiteChrome>
      <div className={styles.loginContainer}>
        <Stack gap="md" align="center">
          <Text as="h1" variant="display" color="primary">
            Session expired
          </Text>
          <Text variant="body" color="secondary">
            Your session ended. Sign in again to pick up where you left off.
          </Text>
          <Button variant="primary" onClick={() => signIn()}>
            Sign In
          </Button>
        </Stack>
      </div>
    </SiteChrome>
  );
}

/**
 * Root layout route — maps the shared auth gate's phase to a screen before
 * any child routes render. The gate ORDER lives in @mbe/auth's useAuthGate.
 * Used as the top-level `element` in createBrowserRouter so that route
 * matching (including basename stripping) happens BEFORE auth checks.
 */
export function App() {
  const gate = useAuthGate();
  // Bypass auth gate for shared spec permalinks (/gen/s/:id)
  const isSharedSpec = window.location.pathname.includes("/gen/s/");

  switch (gate.phase) {
    case "loading":
    case "callback":
    case "signing-out":
      return <LoadingScreen />;
    case "error":
      return (
        <SiteChrome>
          <div className={styles.loginContainer}>
            <Stack gap="md" align="center">
              <Text as="h1" variant="display" color="primary">
                Authentication Error
              </Text>
              <Text variant="body" color="secondary">
                {gate.error.message}
              </Text>
              <Button variant="primary" onClick={() => window.location.assign("/gen")}>
                Try Again
              </Button>
            </Stack>
          </div>
        </SiteChrome>
      );
    case "expired":
      return isSharedSpec ? <Outlet /> : <SessionExpiredScreen />;
    case "signed-out":
      return isSharedSpec ? <Outlet /> : <LoginLanding />;
    case "ready":
      return <Outlet />;
  }
}

/**
 * Redirect helper for the callback route — after successful auth, navigates
 * to the deep link carried through sign-in (validated against open
 * redirects by `signinReturnTo`), or home when none was carried.
 */
export function CallbackRedirect() {
  return <Navigate to={signinReturnTo()} replace />;
}
