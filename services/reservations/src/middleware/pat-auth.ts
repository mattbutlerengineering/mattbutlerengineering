import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JwtVerifier } from "@mbe/auth/fastify";
import { ACCESS_TOKENS_PREFIX, createProblemDetails } from "@mbe/types";
import { isAccessToken } from "../services/access-token.js";

/** Claim set on the identity of a request authenticated by a personal access token. */
export const PAT_CLAIM = "mbePat";
export const TOKEN_READ_ONLY_PROBLEM = "urn:mbe:problem:token-read-only";
const READ_METHODS = new Set(["GET", "HEAD"]);

type Authenticate = (token: string) => Promise<{ id: string; userSub: string } | null>;

/**
 * Verifier that accepts `mbe_pat_…` bearers (#9664) and defers every other
 * token to `fallback` (the Auth0 JWKS verifier). A PAT resolves to its owner's
 * `sub`, so venue-membership checks apply unchanged; an unknown, revoked or
 * expired one throws, which the auth plugin answers with 401.
 */
export function createPatAwareVerifier(
  authenticate: Authenticate,
  fallback: JwtVerifier
): JwtVerifier {
  return async (token) => {
    if (!isAccessToken(token)) return fallback(token);
    const found = await authenticate(token);
    if (!found) throw new Error("Invalid personal access token");
    return { sub: found.userSub, [PAT_CLAIM]: true };
  };
}

/**
 * Server-side read-only enforcement: a request authenticated by a PAT may only
 * GET/HEAD, and never reaches the token endpoints (a token cannot mint or
 * revoke tokens), whatever the route.
 */
export function registerPatReadOnlyGuard(fastify: FastifyInstance): void {
  const isPat = (request: FastifyRequest): boolean => request.user?.raw[PAT_CLAIM] === true;
  const forbid = (reply: FastifyReply) =>
    reply
      .code(403)
      .send(
        createProblemDetails(
          403,
          "Forbidden",
          "Personal access tokens are read-only and cannot manage tokens.",
          TOKEN_READ_ONLY_PROBLEM
        )
      );

  fastify.addHook("onRequest", async (request, reply) => {
    if (isPat(request) && !READ_METHODS.has(request.method)) return forbid(reply);
  });

  // The route's own pattern, known only after routing: a percent-encoded URL
  // (`/me/%74okens`) still matches the route but not a raw-URL prefix test.
  fastify.addHook("preHandler", async (request, reply) => {
    if (isPat(request) && request.routeOptions.url?.startsWith(ACCESS_TOKENS_PREFIX)) {
      return forbid(reply);
    }
  });
}
