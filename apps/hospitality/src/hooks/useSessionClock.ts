import { useEffect, useState } from "react";

/**
 * How long before token expiry the session counts as "refreshing soon".
 *
 * Mirrors `REFRESH_LEAD_MS` in `packages/auth/src/react/hooks.ts` (the
 * proactive silent-refresh lead). That constant is an auth-package internal,
 * so it is duplicated here on purpose — keep the two in sync by hand.
 */
export const REFRESH_WINDOW_MS = 5 * 60 * 1000;

const TICK_MS = 1000;

export type SessionPhase = "fresh" | "refresh-window" | "expired";

export type SessionClock =
  { remainingMs: null; phase: null } | { remainingMs: number; phase: SessionPhase };

/**
 * Classify how much session life remains.
 *
 * The exact `REFRESH_WINDOW_MS` boundary classifies as "refresh-window":
 * packages/auth arms its silent refresh with `delay = max(0, remaining - lead)`,
 * so at exactly 5:00 remaining the refresh is already firing.
 */
export function classifySessionPhase(remainingMs: number): SessionPhase {
  if (remainingMs <= 0) return "expired";
  if (remainingMs <= REFRESH_WINDOW_MS) return "refresh-window";
  return "fresh";
}

/**
 * Read a finite epoch-seconds claim (e.g. `exp`, `iat`) from an untrusted
 * token-claims object. Anything missing, non-numeric, or non-finite yields
 * `undefined` so downstream math can never produce NaN.
 */
export function readEpochClaim(claims: unknown, key: string): number | undefined {
  if (typeof claims !== "object" || claims === null) return undefined;
  const value = (claims as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Percent of the token's lifetime already elapsed, clamped to 0-100.
 * Returns `null` when issue time, expiry, or remaining time is unknown, or the
 * lifetime is non-positive — never an invented number.
 */
export function computeElapsedPercent(
  issuedAt: number | undefined,
  expiresAt: number | undefined,
  remainingMs: number | null
): number | null {
  if (issuedAt === undefined || expiresAt === undefined || remainingMs === null) return null;
  const lifetimeMs = (expiresAt - issuedAt) * 1000;
  if (lifetimeMs <= 0) return null;
  const elapsedMs = Math.min(lifetimeMs, Math.max(0, lifetimeMs - remainingMs));
  return (elapsedMs / lifetimeMs) * 100;
}

/**
 * A 1-second session countdown clock driven by a token expiry (epoch seconds).
 *
 * Owns the interval and pauses it while `document.visibilityState` is
 * "hidden" so a background tab doesn't burn animation frames; on return to
 * visibility it snaps straight to the real remaining time. With no known
 * expiry it returns the null clock and runs no interval.
 */
export function useSessionClock(expiresAt: number | undefined): SessionClock {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === undefined) return undefined;

    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      interval ??= setInterval(() => setNow(Date.now()), TICK_MS);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [expiresAt]);

  if (expiresAt === undefined) return { remainingMs: null, phase: null };

  const remainingMs = Math.max(0, expiresAt * 1000 - now);
  return { remainingMs, phase: classifySessionPhase(remainingMs) };
}
