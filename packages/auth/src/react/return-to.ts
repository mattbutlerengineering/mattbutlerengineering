/**
 * Pure helpers for preserving the user's destination ("returnTo") through the
 * OIDC sign-in round-trip, carried via the OIDC `state` parameter.
 *
 * The state parameter is attacker-influenceable, so every value read back from
 * it MUST pass {@link isSafeReturnTo} before being used as a navigation target —
 * an unvalidated returnTo is an open-redirect vulnerability.
 */

/** Options accepted by `useAuth().signIn`. */
export interface SignInOptions {
  /**
   * App-relative path (starting with "/", relative to the router basename) to
   * restore after sign-in. Defaults to the current location.
   */
  returnTo?: string;
}

/**
 * Validates that a candidate returnTo value is a safe, app-relative path.
 *
 * Rejects absolute URLs, protocol-relative URLs ("//host"), and the
 * backslash variant ("/\host") that some browsers normalize to "//host".
 */
export function isSafeReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}

/**
 * Derives the app base path (router basename) from an OIDC redirect URI by
 * dropping its final path segment — e.g. "https://x/hospitality/callback"
 * yields "/hospitality", and "https://x/callback" yields "".
 */
export function appBasePath(redirectUri: string): string {
  try {
    const pathname = new URL(redirectUri).pathname;
    const base = pathname.replace(/\/[^/]*$/, "");
    return base === "/" ? "" : base;
  } catch {
    return "";
  }
}

/**
 * Derives an app-relative returnTo path from a window-style location, stripping
 * the router basename (derived from the redirect URI) so the restore does not
 * double-prefix. Falls back to "/" when the result is not a safe path.
 */
export function deriveReturnTo(
  location: Pick<Location, "pathname" | "search" | "hash">,
  redirectUri: string
): string {
  const base = appBasePath(redirectUri);
  const full = location.pathname + location.search + location.hash;

  let candidate = full;
  if (base && full.startsWith(base)) {
    const next = full.charAt(base.length);
    if (next === "" || next === "/" || next === "?" || next === "#") {
      const rest = full.slice(base.length);
      candidate = rest.startsWith("/") ? rest : "/" + rest;
    }
  }

  return isSafeReturnTo(candidate) ? candidate : "/";
}

/**
 * Extracts a validated returnTo path from an OIDC state value round-tripped
 * through the provider. Returns undefined for missing, malformed, or unsafe
 * values — never an unvalidated string.
 */
export function extractReturnTo(state: unknown): string | undefined {
  if (state === null || typeof state !== "object") return undefined;
  const candidate = (state as Record<string, unknown>).returnTo;
  return isSafeReturnTo(candidate) ? candidate : undefined;
}
