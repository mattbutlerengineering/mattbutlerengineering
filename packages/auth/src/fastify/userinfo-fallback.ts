import type { FastifyRequest } from "fastify";
import type { AuthUser } from "../types/index.js";

/** Profile claims recoverable from the OIDC userinfo endpoint. */
export interface ProfileClaims {
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
 * ID token carries them — so a real production token leaves `AuthUser.email`
 * `undefined` after {@link toAuthUser}. The userinfo endpoint is the standard
 * OIDC mechanism for recovering those claims from the same bearer token
 * (#9563). Returns `null` on any failure so callers fall back to their
 * existing no-email handling. Never logs the token.
 */
export async function fetchUserInfoClaims(
  authority: string,
  bearerToken: string
): Promise<ProfileClaims | null> {
  try {
    const normalizedAuthority = authority.replace(/\/$/, "");
    const response = await fetch(`${normalizedAuthority}/userinfo`, {
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

/**
 * Opt-in userinfo fallback (ADR-010): enriches `user` with profile claims
 * recovered from the OIDC userinfo endpoint when the verified JWT didn't
 * carry them (`user.email` is `undefined`). Shared by any service built on
 * `@mbe/auth` that keys identity on email — originally `services/users`
 * only (#9563); `services/reservations` and `services/agent` have the same
 * latent gap via `toAuthUser` and can call this directly with no duplicated
 * Auth0 HTTP logic once they opt in.
 *
 * No-op (returns `user` unchanged) when `user` already has an email, the
 * request carries no Bearer token, or the userinfo call fails for any
 * reason — callers keep their existing no-email handling as the fallback.
 */
export async function resolveProfileClaims(
  request: Pick<FastifyRequest, "headers">,
  user: AuthUser | undefined,
  authority: string
): Promise<AuthUser | undefined> {
  if (!user || user.email) return user;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return user;

  const claims = await fetchUserInfoClaims(authority, authHeader.slice(7));
  if (!claims) return user;

  return {
    ...user,
    email: claims.email ?? user.email,
    emailVerified: claims.emailVerified ?? user.emailVerified,
    name: claims.name ?? user.name,
    picture: claims.picture ?? user.picture,
  };
}
