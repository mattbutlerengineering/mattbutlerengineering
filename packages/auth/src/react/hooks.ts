import { useCallback, useEffect, useRef } from "react";
import { useAuth as useOIDCAuth } from "react-oidc-context";
import type { AuthUser, JWTPayload } from "../types/index.js";
import { deriveReturnTo } from "./return-to.js";
import type { SignInOptions } from "./return-to.js";
import { isSilentAuthError } from "./auth-error.js";
import { rememberPreAuthHistoryLength } from "./auth-history.js";
import { useSessionLifecycle } from "./session-lifecycle-context.js";

/** The navigator react-oidc-context currently has in flight, if any. */
export type ActiveNavigator = NonNullable<ReturnType<typeof useOIDCAuth>["activeNavigator"]>;

/**
 * Hook to access authentication state and methods
 */
const SIGN_OUT_NAVIGATORS: ReadonlySet<ActiveNavigator> = new Set<ActiveNavigator>([
  "signoutRedirect",
  "signoutPopup",
  "signoutSilent",
]);

export function useAuth() {
  const auth = useOIDCAuth();
  const lifecycle = useSessionLifecycle();

  // react-oidc-context flips `isLoading` on for the whole life of ANY
  // navigator call (signinSilent, signinRedirect, …). A background refresh or
  // an opening sign-in redirect is not "loading" to a consumer — rendering a
  // loading screen there unmounts the authenticated app mid-session (or hides
  // the login gate's own in-flight state). Sign-OUT navigators are the
  // exception: oidc-client-ts removes the user before the end-session
  // navigation, so without the loading mask the login gate would flash with
  // a live Sign In button that races the redirect. Loading therefore means
  // bootstrap, callback processing, or a sign-out in flight.
  const activeNavigator = auth.activeNavigator;
  const signOutInFlight = activeNavigator !== undefined && SIGN_OUT_NAVIGATORS.has(activeNavigator);
  const silentFailure = isSilentAuthError(auth.error);
  // react-oidc-context memoizes signinSilent per UserManager, so this stays
  // stable across renders and consumers can memoize on it.
  const oidcSigninSilent = auth.signinSilent;
  const signInSilent = useCallback(() => oidcSigninSilent(), [oidcSigninSilent]);

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
    isLoading: auth.isLoading && (activeNavigator === undefined || signOutInFlight),
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
      rememberPreAuthHistoryLength();
      const returnTo =
        options?.returnTo ?? deriveReturnTo(window.location, auth.settings.redirect_uri);
      return auth.signinRedirect({ state: { returnTo } });
    },
    /** Sign out - redirects to OIDC provider */
    signOut: () => auth.signoutRedirect(),
    /** Sign in silently (refresh token) */
    signInSilent,
    /** Interactive sign-in / sign-out error, if any — never a background refresh failure */
    error: silentFailure ? undefined : auth.error,
    /** The most recent silent-refresh failure, or null — see {@link useAccessToken} */
    refreshError: silentFailure ? (auth.error ?? null) : null,
  };
}

/**
 * Stale-session facts for {@link useAuthGate}: how long the stored token has
 * been expired (undefined while valid or absent) and a way to drop the stored
 * user via the user manager without a sign-out redirect. Separate from
 * {@link useAuth} so that hook's return shape (mocked across apps) is unchanged.
 */
export function useStaleSession() {
  const auth = useOIDCAuth();
  const expiresAt = auth.user?.expires_at;
  return {
    expiredForMs:
      expiresAt !== undefined && auth.user?.expired === true
        ? Date.now() - expiresAt * 1000
        : undefined,
    clearSession: () => auth.removeUser(),
  };
}

/** Return shape of {@link useAccessToken}. */
export interface AccessTokenState {
  /** Current access token for API calls, or null when unauthenticated. */
  accessToken: string | null;
  /**
   * Error from the most recent silent renew, or null when none has failed.
   * Callers can surface a re-login prompt.
   */
  refreshError: Error | null;
}

/**
 * Hook to get the access token for API calls.
 *
 * Renewal is owned by oidc-client-ts's `automaticSilentRenew` (it lives outside
 * the React tree, so it covers every app and route, and polls the clock so it
 * survives sleep/wake). This hook only reads state. react-oidc-context's wrapped
 * navigators never reject; a failed renew arrives as a context error whose
 * `source` is silent (see `isSilentAuthError`) and is surfaced as `refreshError`.
 */
export function useAccessToken(): AccessTokenState {
  const auth = useOIDCAuth();
  const refreshError = isSilentAuthError(auth.error) ? (auth.error ?? null) : null;

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
