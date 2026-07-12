import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload as VerifiedJWTPayload } from "jose";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import type { JWTPayload, AuthUser } from "../types/index.js";
import { createProblemDetails, titleForStatus } from "@mbe/types";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    authBypassTestMode: boolean;
  }
}

export interface AuthPluginOptions {
  /** OIDC authority URL (issuer) */
  authority: string;
  /** Expected audience */
  audience: string;
  /** Routes to exclude from token verification (e.g., ["/health"]) */
  excludePaths?: string[];
  /**
   * When true, requests opting in via the bypass header skip JWT validation
   * and receive a hardcoded admin identity. Resolved once from AUTH_BYPASS_IN_TESTS
   * in getAuthPluginOptionsFromEnv(). Never set this in production.
   */
  bypassTestMode?: boolean;
  /**
   * Verifies a Bearer token and returns its decoded claims, or throws on any
   * validation failure. Optional seam (ADR-020 injection style): defaults to the
   * standard OIDC/JWKS adapter (createRemoteJWKSet + jwtVerify, per ADR-010), so
   * existing consumers need not pass it. Tests inject a stub to exercise
   * verification-failure branches without network I/O.
   */
  verifier?: JwtVerifier;
}

/**
 * Verifier seam: given a raw Bearer token, resolve the decoded JWT claims or
 * throw. The default implementation ({@link createJoseVerifier}) uses standard
 * OIDC/JWKS verification (ADR-010); consumers/tests may inject an alternative.
 */
export type JwtVerifier = (token: string) => Promise<VerifiedJWTPayload>;

/**
 * The SINGLE definition of the security-critical test-bypass predicate, shared
 * by the onRequest hook and {@link requireAuth} so the two can never drift.
 *
 * Positive opt-in gate: the bypass activates ONLY when NODE_ENV=test AND the
 * plugin was registered with bypassTestMode AND the request opted in via the
 * bypass header. Production, staging, and an unset NODE_ENV all leave it OFF, so
 * one bad deploy config cannot grant a hardcoded admin identity on a live service.
 */
export function isTestBypass(
  request: Pick<FastifyRequest, "headers">,
  bypassTestMode: boolean
): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    bypassTestMode &&
    request.headers["x-auth-bypass"] === "true"
  );
}

/**
 * Pure mapping from verified JWT claims to an {@link AuthUser}. Returns null when
 * the payload lacks a string `sub` claim, letting the caller emit the specific
 * "missing sub" 401. Extracted so the mapping is table-testable in isolation.
 */
export function toAuthUser(payload: VerifiedJWTPayload): AuthUser | null {
  if (typeof payload.sub !== "string") {
    return null;
  }

  const jwtPayload: JWTPayload = {
    ...payload,
    sub: payload.sub,
    iss: payload.iss ?? "",
    aud: payload.aud ?? "",
    exp: payload.exp ?? 0,
    iat: payload.iat ?? 0,
    email: payload.email as string | undefined,
    email_verified: payload.email_verified as boolean | undefined,
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  };

  return {
    id: jwtPayload.sub,
    email: jwtPayload.email,
    name: jwtPayload.name,
    picture: jwtPayload.picture,
    emailVerified: jwtPayload.email_verified,
    raw: jwtPayload,
  };
}

/**
 * Default verifier: standard OIDC/JWKS verification via jose (ADR-010, no Auth0
 * SDK). Fetches signing keys from `{authority}/.well-known/jwks.json` and checks
 * the issuer (normalized to a trailing slash) and audience. Behaviour is
 * identical to the previously-inline verification path.
 */
export function createJoseVerifier(authority: string, audience: string): JwtVerifier {
  const normalizedAuthority = authority.replace(/\/$/, "");
  const jwksUri = `${normalizedAuthority}/.well-known/jwks.json`;
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const issuer = `${normalizedAuthority}/`;

  return async (token) => {
    const { payload } = await jwtVerify(token, JWKS, { issuer, audience });
    return payload;
  };
}

/**
 * Fastify plugin for JWT validation using OIDC provider's JWKS.
 *
 * **Rate limiting:** This plugin does NOT enforce rate limiting itself.
 * Consumers MUST register `@fastify/rate-limit` (or equivalent) before
 * registering this plugin. An `onReady` hook will log a warning if the
 * `rateLimit` decorator is missing at startup.
 */
async function authPluginImpl(fastify: FastifyInstance, options: AuthPluginOptions) {
  const { authority, audience, excludePaths = [], bypassTestMode = false } = options;

  // Verifier seam: default to the standard OIDC/JWKS adapter (ADR-010), or the
  // injected verifier when provided. Default behaviour is identical to before.
  const verify = options.verifier ?? createJoseVerifier(authority, audience);

  // Expose bypassTestMode on the instance so requireAuth (a standalone preHandler)
  // can consult it without reading process.env at request time.
  fastify.decorate("authBypassTestMode", bypassTestMode);

  // Prominent startup warning when the test auth bypass is enabled. The bypass
  // grants a hardcoded admin identity with no JWT validation, so it must never
  // be active outside tests (only active when NODE_ENV=test, via the guard in the onRequest hook).
  if (bypassTestMode) {
    fastify.log.warn(
      "AUTH_BYPASS_IN_TESTS=true — auth bypass is ENABLED. Matching requests " +
        "skip JWT validation and receive a hardcoded admin identity. This bypass is default " +
        "OFF and only activates when NODE_ENV=test. NEVER set AUTH_BYPASS_IN_TESTS in production."
    );
  }

  // Warn if rate limiting has not been registered by the consuming service.
  // The auth plugin delegates rate limiting to consumers (e.g., @fastify/rate-limit).
  fastify.addHook("onReady", async () => {
    if (!fastify.hasDecorator("rateLimit")) {
      fastify.log.warn(
        "Auth plugin registered without rate limiting — register @fastify/rate-limit before @mbe/auth to protect auth endpoints"
      );
    }
  });

  // github[js/missing-rate-limiting] - rate limiting is the consumer's responsibility.
  // Consuming services (e.g., services/users) register @fastify/rate-limit globally
  // before this plugin, so all routes — including this onRequest hook — are covered.
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Explicit test bypass — the single predicate, shared with requireAuth.
    if (isTestBypass(request, bypassTestMode)) {
      request.user = {
        id: "auth0|user-123",
        email: "test@example.com",
        raw: {
          sub: "auth0|user-123",
          iss: "https://test.auth0.com",
          aud: ["https://api.test.com"],
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          permissions: ["admin"],
        },
      };
      return;
    }

    // 2. Skip excluded paths
    if (excludePaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    // 3. Regular JWT Validation
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return;
    }

    const token = authHeader.slice(7);

    // 4. Rate limit verification (defense-in-depth)
    // github[js/missing-rate-limiting] — restrictive limit for crypto-intensive verification
    if (fastify.hasDecorator("rateLimit")) {
      // hasDecorator("rateLimit") is the runtime proof the decorator exists; the
      // cast supplies its shape because @mbe/auth does not depend on
      // @fastify/rate-limit, so its module augmentation is not in scope.
      const rateLimitedFastify = fastify as unknown as {
        rateLimit: (opts: {
          max: number;
          timeWindow: string;
          keyGenerator: (req: FastifyRequest) => string;
        }) => Promise<void>;
      };
      try {
        await rateLimitedFastify.rateLimit({
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => req.ip,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          error.statusCode === 429
        ) {
          return reply
            .code(429)
            .send(
              createProblemDetails(429, titleForStatus(429), "Authentication rate limit exceeded")
            );
        }
        // Fall through on other errors — don't block auth due to rate limit failures
      }
    }

    // 5. Verify the token via the seam, then map claims to the request user.
    try {
      const payload = await verify(token);
      const user = toAuthUser(payload);

      if (!user) {
        request.log.warn("JWT missing required 'sub' claim");
        return reply
          .code(401)
          .send(createProblemDetails(401, titleForStatus(401), "Invalid token: missing sub"));
      }

      request.user = user;
    } catch (error) {
      request.log.warn({ error }, "JWT validation failed");
      return reply.code(401).send(createProblemDetails(401, titleForStatus(401), "Invalid token"));
    }
  });
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = fp(authPluginImpl, {
  name: "@mbe/auth",
  fastify: "5.x",
});

export function hasPermission(user: AuthUser | undefined, permission: string): boolean {
  const permissions = user?.raw?.permissions;
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(permission);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const bypassTestMode = (request.server as FastifyInstance).authBypassTestMode ?? false;
  if (!request.user && !isTestBypass(request, bypassTestMode)) {
    return reply
      .code(401)
      .send(
        createProblemDetails(401, titleForStatus(401), "Missing or invalid authorization header")
      );
  }
}

export async function optionalAuth(_request: FastifyRequest, _reply: FastifyReply) {}

export function getAuthPluginOptionsFromEnv(): AuthPluginOptions {
  const authority = process.env.AUTH_AUTHORITY;
  const audience = process.env.AUTH_AUDIENCE;

  if (!authority || !audience) {
    throw new Error("Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE");
  }

  return {
    authority,
    audience,
    excludePaths: ["/health", "/docs", "/v1/webhooks"],
    bypassTestMode: process.env.AUTH_BYPASS_IN_TESTS === "true",
  };
}
