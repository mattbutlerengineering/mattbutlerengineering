import { useCallback, useEffect, useRef } from "react";
import { useAuth as useOIDCAuth } from "react-oidc-context";
import type { AuthUser, JWTPayload } from "../types/index.js";

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
    /** Sign in - redirects to OIDC provider */
    signIn: () => auth.signinRedirect(),
    /** Sign out - redirects to OIDC provider */
    signOut: () => auth.signoutRedirect(),
    /** Sign in silently (refresh token) */
    signInSilent: () => auth.signinSilent(),
    /** Auth error if any */
    error: auth.error,
  };
}

/**
 * Hook to get access token for API calls
 * Proactively refreshes token when within 5 minutes of expiry
 */
export function useAccessToken(): string | null {
  const auth = useOIDCAuth();
  const expiresAt = auth.user?.expires_at;
  const signinSilent = auth.signinSilent;

  useEffect(() => {
    if (!expiresAt) return;

    const msUntilExpiry = expiresAt * 1000 - Date.now();
    // Proactively refresh when within 5 minutes of expiry
    if (msUntilExpiry > 0 && msUntilExpiry < 5 * 60 * 1000) {
      signinSilent().catch(() => {
        // Silent refresh failed — token may have fully expired
      });
    }
  }, [expiresAt, signinSilent]);

  return auth.user?.access_token ?? null;
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
