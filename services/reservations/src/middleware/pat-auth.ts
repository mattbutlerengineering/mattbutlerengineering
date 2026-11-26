import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JwtVerifier } from "@mbe/auth/fastify";
import {
  ACCESS_TOKENS_PREFIX,
  availabilityConfigEndpoints,
  createProblemDetails,
} from "@mbe/types";
import { isAccessToken, type AuthenticatedAccessToken } from "../services/access-token.js";

/** Claim set on the identity of a request authenticated by a personal access token. */
const PAT_CLAIM = "mbePat";
/** Claim set, alongside `PAT_CLAIM`, when that token carries the write scope (#9778). */
const PAT_WRITE_CLAIM = "mbePatWrite";
const TOKEN_READ_ONLY_PROBLEM = "urn:mbe:problem:token-read-only";
const READ_METHODS = new Set(["GET", "HEAD"]);

const routeKey = (method: string, url: string): string => `${method} ${url}`;

/**
 * A token may only move a booking: date, time, table, party size. Status
 * (a cancel or a no-show fee), `override` (skips pacing limits), notes and the
 * other fields stay with signed-in staff.
 */
const MOVE_BOOKING_FIELDS: ReadonlySet<string> = new Set([
  "date",
  "startTime",
  "endTime",
  "tableId",
  "partySize",
]);

/**
 * The only writes a write-scoped token may make (#9778), keyed on method plus
 * the route's own pattern: what the first MCP write tools need to move a
 * booking and to pause or resume tables (#9489). The value is the body fields
 * the token may send, or `null` when the route's body is not narrowed. Each new
 * write tool adds its routes here deliberately; anything absent stays read-only.
 */
const PAT_WRITE_ROUTES: ReadonlyMap<string, ReadonlySet<string> | null> = new Map([
  [routeKey("PATCH", "/api/v1/reservations/:id"), MOVE_BOOKING_FIELDS],
  ...[
    availabilityConfigEndpoints.closureImpact,
    availabilityConfigEndpoints.createClosure,
    availabilityConfigEndpoints.reopenClosure,
  ].map(({ method, path }) => [routeKey(method, path), null] as const),
]);

/** True when `body` sends only fields in `allowed` (an absent body sends none). */
const bodyWithin = (body: unknown, allowed: ReadonlySet<string>): boolean => {
  if (body === undefined || body === null) return true;
  if (typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body).every((field) => allowed.has(field));
};

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
    return { sub: found.userSub, [PAT_CLAIM]: true, [PAT_WRITE_CLAIM]: found.write };
  };
}

/**
 * Server-side scope enforcement for a request authenticated by a PAT: a
 * read-only token may only GET/HEAD; a write-scoped token may also make the
 * writes in `PAT_WRITE_ROUTES` and no other. No token ever reaches the token
 * endpoints (a token cannot mint or revoke tokens), whatever the route.
 */
export function registerPatReadOnlyGuard(fastify: FastifyInstance): void {
  const isPat = (request: FastifyRequest): boolean => request.user?.raw[PAT_CLAIM] === true;
  const writeRouteOf = (request: FastifyRequest) =>
    PAT_WRITE_ROUTES.get(routeKey(request.method, request.routeOptions.url ?? ""));
  const mayWrite = (request: FastifyRequest): boolean =>
    request.user?.raw[PAT_WRITE_CLAIM] === true && writeRouteOf(request) !== undefined;
  const forbid = (reply: FastifyReply) =>
    reply
      .code(403)
      .send(
        createProblemDetails(
          403,
          "Forbidden",
          "This personal access token cannot make this change or manage tokens.",
          TOKEN_READ_ONLY_PROBLEM
        )
      );

  // The route's own pattern (`routeOptions.url`), never the raw URL: a
  // percent-encoded path still matches its route but not a string test.
  fastify.addHook("onRequest", async (request, reply) => {
    if (isPat(request) && !READ_METHODS.has(request.method) && !mayWrite(request)) {
      return forbid(reply);
    }
  });

  // preHandler, not onRequest: the body is parsed by now. A write that got past
  // onRequest is on PAT_WRITE_ROUTES; a narrowed route accepts only its fields.
  fastify.addHook("preHandler", async (request, reply) => {
    if (!isPat(request)) return;
    if (request.routeOptions.url?.startsWith(ACCESS_TOKENS_PREFIX)) return forbid(reply);
    if (READ_METHODS.has(request.method)) return;
    const fields = writeRouteOf(request);
    if (fields && !bodyWithin(request.body, fields)) return forbid(reply);
  });
}
