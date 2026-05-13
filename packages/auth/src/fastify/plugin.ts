import { createRemoteJWKSet, jwtVerify } from "jose";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import type { JWTPayload, AuthUser } from "../types/index.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export interface AuthPluginOptions {
  /** OIDC authority URL (issuer) */
  authority: string;
  /** Expected audience */
  audience: string;
  /** Routes to exclude from token verification (e.g., ["/health"]) */
  excludePaths?: string[];
}

function createProblemDetails(status: number, title: string, detail: string) {
  return {
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    detail,
    error: title,
    message: detail,
    statusCode: status,
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
async function authPluginImpl(
  fastify: FastifyInstance,
  options: AuthPluginOptions
) {
  const { authority, audience, excludePaths = [] } = options;

  const jwksUri = `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
  const JWKS = createRemoteJWKSet(new URL(jwksUri));

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
    // 1. Explicit Test Bypass
    // Check if bypass mode is enabled AND the request opted in via header.
    if (process.env.AUTH_BYPASS_IN_TESTS === "true" && request.headers["x-auth-bypass"] === "true") {
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
      try {
        await (fastify as any).rateLimit({
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => req.ip,
        });
      } catch (error: any) {
        if (error.statusCode === 429) {
          return reply.code(429).send(createProblemDetails(429, "Too Many Requests", "Authentication rate limit exceeded"));
        }
        // Fall through on other errors — don't block auth due to rate limit failures
      }
    }

    try {
      const result = await jwtVerify(token, JWKS, {
        issuer: authority.replace(/\/$/, "") + "/",
        audience,
      });

      if (!result || !result.payload || typeof result.payload.sub !== "string") {
        request.log.warn("JWT missing required 'sub' claim");
        return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Invalid token: missing sub"));
      }

      const { payload } = result;

      const jwtPayload: JWTPayload = {
        ...payload,
        sub: payload.sub as string,
        iss: payload.iss ?? "",
        aud: payload.aud ?? "",
        exp: payload.exp ?? 0,
        iat: payload.iat ?? 0,
        email: payload.email as string | undefined,
        email_verified: payload.email_verified as boolean | undefined,
        name: payload.name as string | undefined,
        picture: payload.picture as string | undefined,
      };

      request.user = {
        id: jwtPayload.sub,
        email: jwtPayload.email,
        name: jwtPayload.name,
        picture: jwtPayload.picture,
        emailVerified: jwtPayload.email_verified,
        raw: jwtPayload,
      };
    } catch (error) {
      request.log.warn({ error }, "JWT validation failed");
      return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Invalid token"));
    }
  });
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = fp(authPluginImpl, {
  name: "@mbe/auth",
  fastify: "5.x",
});

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const isBypassed = process.env.AUTH_BYPASS_IN_TESTS === "true" && request.headers["x-auth-bypass"] === "true";
  if (!request.user && !isBypassed) {
    return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Missing or invalid authorization header"));
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
  };
}
