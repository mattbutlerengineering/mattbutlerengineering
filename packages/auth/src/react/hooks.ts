import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth as useOIDCAuth } from "react-oidc-context";
import type { AuthUser, JWTPayload } from "../types/index.js";
import { deriveReturnTo } from "./return-to.js";
import type { SignInOptions } from "./return-to.js";

/**
 * Hook to access authentication state and methods
 */
export function useAuth() {
  const auth = useOIDCAuth();

  const user: AuthUser | null = auth.user
    ? {
        id: auth.user.profile.sub,
        email: auth.user.profile.email,
        name: auth.user.profile.name,
        picture: auth.user.profile.picture,
        emailVerified: auth.user.profile.email_verified,
        raw: auth.user.profile as JWTPayload,
      }
    : null;

  return {
    /** Whether auth state is loading */
    isLoading: auth.isLoading,
    /** Whether user is authenticated */
    isAuthenticated: auth.isAuthenticated,
    /** Current authenticated user */
    user,
    /** Access token for API calls */
    accessToken: auth.user?.access_token ?? null,
    /**
     * Sign in - redirects to OIDC provider. Carries `returnTo` (an
     * app-relative path, defaulting to the current location relative to the
     * app base path) through the OIDC `state` so the destination survives the
     * round-trip. Consumers receive it back via the provider's
     * `onSigninCallback(returnTo)`.
     */
    signIn: (options?: SignInOptions) => {
      const returnTo =
        options?.returnTo ?? deriveReturnTo(window.location, auth.settings.redirect_uri);
      return auth.signinRedirect({ state: { returnTo } });
    },
    /** Sign out - redirects to OIDC provider */
    signOut: () => auth.signoutRedirect(),
    /** Sign in silently (refresh token) */
    signInSilent: () => auth.signinSilent(),
    /** Auth error if any */
    error: auth.error,
  };
}

/** How far ahead of expiry to proactively refresh the token (5 minutes). */
const REFRESH_LEAD_MS = 5 * 60 * 1000;

/** Return shape of {@link useAccessToken}. */
export interface AccessTokenState {
  /** Current access token for API calls, or null when unauthenticated. */
  accessToken: string | null;
  /**
   * Error from the most recent proactive silent refresh, or null when the last
   * refresh succeeded (or none has run yet). Callers can surface a re-login prompt.
   */
  refreshError: Error | null;
}

/**
 * Hook to get the access token for API calls.
 *
 * Schedules a proactive silent refresh {@link REFRESH_LEAD_MS} before the token
 * expires so long-lived sessions never go stale. The timer re-arms whenever
 * `expires_at` changes and is cleared on unmount. A failed refresh is surfaced
 * via `refreshError` instead of being swallowed, so callers can prompt re-login.
 */
export function useAccessToken(): AccessTokenState {
  const auth = useOIDCAuth();
  const expiresAt = auth.user?.expires_at;
  const signinSilent = auth.signinSilent;
  const [refreshError, setRefreshError] = useState<Error | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    const msUntilExpiry = expiresAt * 1000 - Date.now();
    // Refresh REFRESH_LEAD_MS before expiry; fire immediately if already inside the window.
    const delay = Math.max(0, msUntilExpiry - REFRESH_LEAD_MS);

    const timer = setTimeout(() => {
      signinSilent()
        .then(() => setRefreshError(null))
        .catch((error: unknown) => {
          setRefreshError(error instanceof Error ? error : new Error(String(error)));
        });
    }, delay);

    return () => clearTimeout(timer);
  }, [expiresAt, signinSilent]);

  return {
    accessToken: auth.user?.access_token ?? null,
    refreshError,
  };
}

/**
 * Hook that requires authentication
 * Automatically redirects to login if not authenticated
 */
export function useRequireAuth() {
  const auth = useAuth();
  const signInRef = useRef(auth.signIn);

  useEffect(() => {
    signInRef.current = auth.signIn;
  }, [auth.signIn]);

  const stableSignIn = useCallback(() => {
    signInRef.current();
  }, []);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      stableSignIn();
    }
  }, [auth.isLoading, auth.isAuthenticated, stableSignIn]);

  return auth;
}
