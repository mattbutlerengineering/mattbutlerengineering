import { describe, it, expect } from "vitest";
import { resolveAuthGate, STALE_SESSION_MS } from "./auth-gate.js";
import type { AuthGate, AuthGateFacts, AuthGateLocation } from "./auth-gate.js";

const ERR = new Error("Sign-in failed");

const SETTLED: AuthGateFacts = {
  isLoading: false,
  isAuthenticated: false,
  error: undefined,
  sessionExpired: false,
  activeNavigator: undefined,
};

const at = (pathname: string, search = "", hash = ""): AuthGateLocation => ({
  pathname,
  search,
  hash,
});

const APP = at("/hospitality/reservations");
const CALLBACK_IN_FLIGHT = at("/hospitality/callback", "?code=abc&state=xyz");
const CALLBACK_ERROR_PARAMS = at("/hospitality/callback", "?error=access_denied&state=xyz");
const CALLBACK_BARE = at("/hospitality/callback");

interface Row {
  readonly name: string;
  readonly facts: Partial<AuthGateFacts>;
  readonly location: AuthGateLocation;
  readonly expected: AuthGate;
}

/**
 * The canonical gate order, one row per transition. Earlier phases win over
 * later ones whenever their facts overlap — each "beats" row pins that.
 */
const TABLE: readonly Row[] = [
  // 1. Loading — the only phases reachable while useAuth().isLoading is true.
  {
    name: "sign-out redirect in flight → signing-out",
    facts: { isLoading: true, activeNavigator: "signoutRedirect" },
    location: APP,
    expected: { phase: "signing-out" },
  },
  {
    name: "signing-out beats callback when sign-out runs on /callback",
    facts: { isLoading: true, activeNavigator: "signoutRedirect" },
    location: CALLBACK_IN_FLIGHT,
    expected: { phase: "signing-out" },
  },
  {
    name: "loading on /callback → callback (code exchange in flight)",
    facts: { isLoading: true },
    location: CALLBACK_IN_FLIGHT,
    expected: { phase: "callback" },
  },
  {
    name: "loading off the callback path → loading",
    facts: { isLoading: true },
    location: APP,
    expected: { phase: "loading" },
  },
  {
    name: "loading beats error",
    facts: { isLoading: true, error: ERR },
    location: APP,
    expected: { phase: "loading" },
  },
  // 2. Error — surfaced in place, tagged with whether it came off the callback.
  {
    name: "error off the callback path → error (not on callback)",
    facts: { error: ERR },
    location: APP,
    expected: { phase: "error", error: ERR, onCallback: false },
  },
  {
    name: "error on /callback → error (on callback)",
    facts: { error: ERR },
    location: CALLBACK_ERROR_PARAMS,
    expected: { phase: "error", error: ERR, onCallback: true },
  },
  {
    name: "error beats a session that is still authenticated",
    facts: { error: ERR, isAuthenticated: true },
    location: APP,
    expected: { phase: "error", error: ERR, onCallback: false },
  },
  // 3. Callback path, unauthenticated — params decide wait vs. signed out.
  {
    name: "/callback with OIDC params, settled, not yet authenticated → callback",
    facts: {},
    location: CALLBACK_IN_FLIGHT,
    expected: { phase: "callback" },
  },
  {
    name: "/callback with OIDC params in the hash → callback",
    facts: {},
    location: at("/hospitality/callback", "", "#code=abc&state=xyz"),
    expected: { phase: "callback" },
  },
  {
    name: "bare /callback (sign-out landing) → signed-out after sign-out, never loading",
    facts: {},
    location: CALLBACK_BARE,
    expected: { phase: "signed-out", afterSignOut: true },
  },
  {
    name: "bare /callback beats a lapsed session",
    facts: { sessionExpired: true },
    location: CALLBACK_BARE,
    expected: { phase: "signed-out", afterSignOut: true },
  },
  // 4. Expired — before isAuthenticated, which react-oidc-context never re-evaluates.
  {
    name: "lapsed token while still 'authenticated' → expired",
    facts: { isAuthenticated: true, sessionExpired: true },
    location: APP,
    expected: { phase: "expired" },
  },
  {
    name: "lapsed restored session, not authenticated → expired",
    facts: { sessionExpired: true },
    location: APP,
    expected: { phase: "expired" },
  },
  // 5. Signed out cold.
  {
    name: "unauthenticated off the callback path → signed-out (cold)",
    facts: {},
    location: APP,
    expected: { phase: "signed-out", afterSignOut: false },
  },
  // 6. Ready.
  {
    name: "authenticated → ready",
    facts: { isAuthenticated: true },
    location: APP,
    expected: { phase: "ready" },
  },
  {
    name: "authenticated on /callback (exchange done) → ready",
    facts: { isAuthenticated: true },
    location: CALLBACK_BARE,
    expected: { phase: "ready" },
  },
  {
    name: "silent refresh keeps the app ready (isLoading masked false by useAuth)",
    facts: { isAuthenticated: true, activeNavigator: "signinSilent" },
    location: APP,
    expected: { phase: "ready" },
  },
];

describe("resolveAuthGate — canonical gate order", () => {
  it.each(TABLE)("$name", ({ facts, location, expected }) => {
    expect(resolveAuthGate({ ...SETTLED, ...facts }, location)).toEqual(expected);
  });

  it("treats only a path ending in /callback as the callback path", () => {
    expect(resolveAuthGate(SETTLED, at("/hospitality/callbacks", "?code=a&state=b"))).toEqual({
      phase: "signed-out",
      afterSignOut: false,
    });
  });
});

describe("resolveAuthGate stale sessions (#7430)", () => {
  const HOUR = 60 * 60 * 1000;
  const expiredFor = (expiredForMs: number | undefined) =>
    resolveAuthGate({ ...SETTLED, sessionExpired: true, expiredForMs }, APP);

  it("STALE_SESSION_MS is 24 hours", () => {
    expect(STALE_SESSION_MS).toBe(24 * HOUR);
  });

  it("expired 1 h ago → expired", () => {
    expect(expiredFor(HOUR)).toEqual({ phase: "expired" });
  });

  it("expired 25 h ago → signed-out landing, not afterSignOut", () => {
    expect(expiredFor(25 * HOUR)).toEqual({ phase: "signed-out", afterSignOut: false });
  });

  it("expired exactly 24 h ago → signed-out", () => {
    expect(expiredFor(STALE_SESSION_MS)).toEqual({ phase: "signed-out", afterSignOut: false });
  });

  it("expiry age unknown → expired (unchanged)", () => {
    expect(expiredFor(undefined)).toEqual({ phase: "expired" });
  });
});
