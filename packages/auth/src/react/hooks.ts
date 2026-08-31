import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth as useOIDCAuth } from "react-oidc-context";
import type { AuthUser, JWTPayload } from "../types/index.js";
import { deriveReturnTo } from "./return-to.js";
import type { SignInOptions } from "./return-to.js";
import { isSilentAuthError } from "./auth-error.js";
import { useSessionLifecycle } from "./session-lifecycle-context.js";

/** The navigator react-oidc-context currently has in flight, if any. */
export type ActiveNavigator = NonNullable<ReturnType<typeof useOIDCAuth>["activeNavigator"]>;

/**
 * Hook to access authentication state and methods
 */
export function useAuth() {
  const auth = useOIDCAuth();
  const lifecycle = useSessionLifecycle();

  // react-oidc-context flips `isLoading` on for the whole life of ANY
  // navigator call (signinSilent, signinRedirect, …). A background refresh or
  // an opening redirect is not "loading" to a consumer — rendering a loading
  // screen there unmounts the authenticated app mid-session. Loading means the
  // initial bootstrap / callback processing only.
  const activeNavigator = auth.activeNavigator;
  const silentFailure = isSilentAuthError(auth.error);

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
    /** Whether the initial auth bootstrap (or the sign-in callback) is still resolving */
    isLoading: auth.isLoading && activeNavigator === undefined,
    /** The navigator currently in flight (`"signinRedirect"`, `"signinSilent"`, …), if any */
    activeNavigator,
    /** Whether a silent token refresh is in flight — the session stays live meanwhile */
    isRefreshing: activeNavigator === "signinSilent",
    /**
     * Whether the access token has expired (or was already expired when the
     * stored session was restored). Distinct from "never signed in".
     */
    sessionExpired: lifecycle.expired || auth.user?.expired === true,
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
    /** Interactive sign-in / sign-out error, if any — never a background refresh failure */
    error: silentFailure ? undefined : auth.error,
    /** The most recent silent-refresh failure, or null — see {@link useAccessToken} */
    refreshError: silentFailure ? (auth.error ?? null) : null,
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
  const [localRefreshError, setLocalRefreshError] = useState<Error | null>(null);

  // The context-wrapped signinSilent never rejects: react-oidc-context catches,
  // dispatches ERROR with a silent `source`, and resolves null. So the real
  // failure signal is the context error; the local catch only matters for a
  // custom UserManager that throws.
  const contextRefreshError = isSilentAuthError(auth.error) ? (auth.error ?? null) : null;

  useEffect(() => {
    if (!expiresAt) return;

    const msUntilExpiry = expiresAt * 1000 - Date.now();
    // Refresh REFRESH_LEAD_MS before expiry; fire immediately if already inside the window.
    const delay = Math.max(0, msUntilExpiry - REFRESH_LEAD_MS);

    const timer = setTimeout(() => {
      signinSilent()
        .then(() => setLocalRefreshError(null))
        .catch((error: unknown) => {
          setLocalRefreshError(error instanceof Error ? error : new Error(String(error)));
        });
    }, delay);

    return () => clearTimeout(timer);
  }, [expiresAt, signinSilent]);

  return {
    accessToken: auth.user?.access_token ?? null,
    refreshError: contextRefreshError ?? localRefreshError,
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
