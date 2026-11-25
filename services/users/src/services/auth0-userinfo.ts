export interface UserInfoClaims {
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly name?: string;
  readonly picture?: string;
}

/** Bound the outbound call so a stalled IdP fails closed instead of hanging handlers. */
const USERINFO_TIMEOUT_MS = 2000;

/**
 * Fetches profile claims from the OIDC userinfo endpoint for the given
 * bearer token.
 *
 * Auth0 omits profile claims (`email`, `name`, `picture`, `email_verified`)
 * from an access token scoped to a custom API audience (ADR-010) — only the
 * ID token carries them — so a real production token leaves
 * `request.user.email` `undefined`. The userinfo endpoint is the standard
 * OIDC mechanism for recovering those claims from the same bearer token
 * (#9563). Returns `null` on any failure so callers fall back to their
 * existing no-email handling.
 */
export async function fetchUserInfoClaims(bearerToken: string): Promise<UserInfoClaims | null> {
  const authority = process.env.AUTH_AUTHORITY;
  if (!authority) return null;

  try {
    const response = await fetch(`${authority.replace(/\/$/, "")}/userinfo`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const claims = data as Record<string, unknown>;

    return {
      email: typeof claims.email === "string" ? claims.email : undefined,
      emailVerified: typeof claims.email_verified === "boolean" ? claims.email_verified : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined,
      picture: typeof claims.picture === "string" ? claims.picture : undefined,
    };
  } catch {
    return null;
  }
}
