import { useEffect } from "react";
import { hasAuthParams } from "react-oidc-context";
import { useAuth, useStaleSession } from "./hooks.js";
import type { ActiveNavigator } from "./hooks.js";

/**
 * The one screen-level answer to "where is this visitor in the sign-in
 * lifecycle?" — apps map each phase to a screen and own nothing else.
 *
 * - `signing-out` — a sign-out redirect is in flight.
 * - `loading` — initial session restore.
 * - `callback` — an OIDC response (code/state) is being exchanged.
 * - `error` — an interactive sign-in/out failed; `onCallback` says whether it
 *   came off the callback path (a failed exchange) or elsewhere.
 * - `signed-out` — no session. `afterSignOut` is true on a bare callback path,
 *   which is where a completed sign-out lands (`post_logout_redirect_uri`
 *   falls back to `redirectUri`).
 * - `expired` — the session lapsed in place, less than {@link STALE_SESSION_MS} ago.
 *   A session dead for longer than that reads as a fresh visit: `signed-out`.
 * - `ready` — authenticated with a live session.
 */
export type AuthGate =
  | { readonly phase: "signing-out" }
  | { readonly phase: "loading" }
  | { readonly phase: "callback" }
  | { readonly phase: "error"; readonly error: Error; readonly onCallback: boolean }
  | { readonly phase: "signed-out"; readonly afterSignOut: boolean }
  | { readonly phase: "expired" }
  | { readonly phase: "ready" };

/** A session expired this long ago is treated as a first visit, not "session expired". */
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000;

/** The `useAuth()` facts the gate reads. */
export interface AuthGateFacts {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly error: Error | undefined;
  readonly sessionExpired: boolean;
  /** Milliseconds since the stored token expired; undefined when unknown. */
  readonly expiredForMs?: number | undefined;
  readonly activeNavigator: ActiveNavigator | undefined;
}

/** The window-location fields the gate reads. */
export type AuthGateLocation = Pick<Location, "pathname" | "search" | "hash">;

/**
 * Pure gate: maps auth facts plus the current location to exactly one phase.
 * The order is load-bearing — see auth-gate.test.ts for every transition.
 */
export function resolveAuthGate(facts: AuthGateFacts, location: AuthGateLocation): AuthGate {
  const onCallback = location.pathname.endsWith("/callback");

  if (facts.isLoading) {
    if (facts.activeNavigator === "signoutRedirect") return { phase: "signing-out" };
    return { phase: onCallback ? "callback" : "loading" };
  }

  if (facts.error) return { phase: "error", error: facts.error, onCallback };

  // Only an in-flight OIDC response is a real wait. A bare /callback is where
  // sign-out lands — waiting there would hang on a loader forever.
  if (onCallback && !facts.isAuthenticated) {
    return hasAuthParams(location as Location)
      ? { phase: "callback" }
      : { phase: "signed-out", afterSignOut: true };
  }

  // Before isAuthenticated: react-oidc-context does not re-evaluate it when a
  // token expires in place.
  if (facts.sessionExpired) {
    if (facts.expiredForMs !== undefined && facts.expiredForMs >= STALE_SESSION_MS) {
      return { phase: "signed-out", afterSignOut: false };
    }
    return { phase: "expired" };
  }

  if (!facts.isAuthenticated) return { phase: "signed-out", afterSignOut: false };

  return { phase: "ready" };
}

/** The auth gate for the current `useAuth()` state and `window.location`. */
export function useAuthGate(): AuthGate {
  const auth = useAuth();
  const { expiredForMs, clearSession } = useStaleSession();
  const gate = resolveAuthGate({ ...auth, expiredForMs }, window.location);
  const stale = auth.sessionExpired && gate.phase === "signed-out";

  // A stale stored user would keep resurfacing; drop it via the user manager.
  useEffect(() => {
    if (stale) void clearSession();
  }, [stale, clearSession]);

  return gate;
}
