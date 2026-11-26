import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JwtVerifier } from "@mbe/auth/fastify";
import {
  ACCESS_TOKENS_PREFIX,
  availabilityConfigEndpoints,
  createProblemDetails,
} from "@mbe/types";
import { isAccessToken, type AuthenticatedAccessToken } from "../services/access-token.js";
import { isBookingMove, isTablePauseResume, isTablePauseSave } from "./pat-write-scope.js";

/** Claim set on the identity of a request authenticated by a personal access token. */
const PAT_CLAIM = "mbePat";
/** Claim set, alongside `PAT_CLAIM`, when that token carries the write scope (#9778). */
const PAT_WRITE_CLAIM = "mbePatWrite";
/** Claim carrying the token's id (never the token itself), for the write audit (#9780). */
const PAT_ID_CLAIM = "mbePatId";
const TOKEN_READ_ONLY_PROBLEM = "urn:mbe:problem:token-read-only";
const READ_METHODS = new Set(["GET", "HEAD"]);

const routeKey = (method: string, url: string): string => `${method} ${url}`;

/** Whether a token may send this body to the route; `null` = a read-only preview, not narrowed. */
type BodyCheck = ((body: unknown) => boolean) | null;

/**
 * The only writes a write-scoped token may make (#9778), keyed on method plus
 * the route's own pattern: a token may only move a booking and pause or resume
 * tables (#9489). Each value checks the parsed body (`pat-write-scope.ts`).
 * Each new write tool adds its routes here deliberately; anything absent stays
 * read-only.
 */
const PAT_WRITE_ROUTES: ReadonlyMap<string, BodyCheck> = new Map<string, BodyCheck>([
  [routeKey("PATCH", "/api/v1/reservations/:id"), isBookingMove],
  [routeKey("POST", availabilityConfigEndpoints.createClosure.path), isTablePauseSave],
  [routeKey("DELETE", availabilityConfigEndpoints.reopenClosure.path), isTablePauseResume],
  [routeKey("POST", availabilityConfigEndpoints.closureImpact.path), null],
]);

/** True when the request was authenticated by a personal access token. */
export const isPatRequest = (request: FastifyRequest): boolean =>
  request.user?.raw[PAT_CLAIM] === true;

type Authenticate = (token: string) => Promise<AuthenticatedAccessToken | null>;

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
    return {
      sub: found.userSub,
      [PAT_CLAIM]: true,
      [PAT_WRITE_CLAIM]: found.write,
      [PAT_ID_CLAIM]: found.id,
    };
  };
}

/**
 * Server-side scope enforcement for a request authenticated by a PAT: a
 * read-only token may only GET/HEAD; a write-scoped token may also make the
 * writes in `PAT_WRITE_ROUTES` and no other. No token ever reaches the token
 * endpoints (a token cannot mint or revoke tokens), whatever the route.
 */
export function registerPatReadOnlyGuard(fastify: FastifyInstance): void {
  const isPat = isPatRequest;
  const writeRouteOf = (request: FastifyRequest) =>
    PAT_WRITE_ROUTES.get(routeKey(request.method, request.routeOptions.url ?? ""));
  const mayWrite = (request: FastifyRequest): boolean =>
    request.user?.raw[PAT_WRITE_CLAIM] === true && writeRouteOf(request) !== undefined;
  const forbid = forbidTokenChange;

  // The route's own pattern (`routeOptions.url`), never the raw URL: a
  // percent-encoded path still matches its route but not a string test.
  fastify.addHook("onRequest", async (request, reply) => {
    if (isPat(request) && !READ_METHODS.has(request.method) && !mayWrite(request)) {
      return forbid(reply);
    }
  });

  // preHandler, not onRequest: the body is parsed by now. A write that got past
  // onRequest is on PAT_WRITE_ROUTES; its check decides what body it may send.
  fastify.addHook("preHandler", async (request, reply) => {
    if (!isPat(request)) return;
    if (request.routeOptions.url?.startsWith(ACCESS_TOKENS_PREFIX)) return forbid(reply);
    if (READ_METHODS.has(request.method)) return;
    const check = writeRouteOf(request);
    if (check && !check(request.body)) return forbid(reply);
  });
}

/** The same 403 the guard answers, for a route's own token check (a stored rule's shape). */
export function forbidTokenChange(reply: FastifyReply) {
  return reply
    .code(403)
    .send(
      createProblemDetails(
        403,
        "Forbidden",
        "This personal access token cannot make this change or manage tokens.",
        TOKEN_READ_ONLY_PROBLEM
      )
    );
}
