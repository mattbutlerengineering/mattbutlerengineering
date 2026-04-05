import { createRemoteJWKSet, jwtVerify } from "jose";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
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

/**
 * Fastify plugin for JWT validation using OIDC provider's JWKS.
 *
 * The onRequest hook is **permissive**: it populates `request.user` when a
 * valid Bearer token is present, rejects requests with *invalid* tokens, and
 * silently passes through requests with no token. Use the `requireAuth`
 * preHandler on routes that must be authenticated, or `optionalAuth` on
 * routes that accept either authenticated or anonymous access (invalid tokens
 * are still rejected by the global hook).
 *
 * Uses jose library for standard JWT/JWKS handling (not Auth0-specific).
 * Wrapped with fastify-plugin to break encapsulation — hooks apply to parent context.
 */
async function authPluginImpl(
  fastify: FastifyInstance,
  options: AuthPluginOptions
) {
  const { authority, audience, excludePaths = [] } = options;

  // Create JWKS client that fetches keys from OIDC provider
  const jwksUri = `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
  const JWKS = createRemoteJWKSet(new URL(jwksUri));

  // Permissive authentication hook — populates request.user when a valid
  // token is present, rejects invalid tokens, passes through missing tokens.
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip excluded paths entirely
    if (excludePaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      // No token provided — continue as anonymous
      return;
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: authority.replace(/\/$/, "") + "/",
        audience,
      });

      const jwtPayload = payload as unknown as JWTPayload;

      request.user = {
        id: jwtPayload.sub,
        email: jwtPayload.email,
        name: jwtPayload.name,
        picture: jwtPayload.picture,
        emailVerified: jwtPayload.email_verified,
        raw: jwtPayload,
      };
    } catch (error) {
      fastify.log.warn({ error }, "JWT validation failed");
      reply.code(401).send(createProblemDetails(401, "Unauthorized", "Invalid token"));
      return;
    }
  });
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = fp(authPluginImpl, {
  name: "@mbe/auth",
  fastify: "5.x",
});

/**
 * Require authentication for a specific route.
 * Use as a preHandler — returns 401 if no valid token was provided.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    reply.code(401).send(createProblemDetails(401, "Unauthorized", "Missing or invalid authorization header"));
    return;
  }
}

/**
 * Allow optional authentication for a specific route.
 * The global onRequest hook already rejects invalid tokens and populates
 * request.user for valid ones, so this is a no-op preHandler that
 * documents the route's intent. Routes can inspect `request.user` to
 * determine if the caller is authenticated.
 */
export async function optionalAuth(_request: FastifyRequest, _reply: FastifyReply) {
  // No-op: the global hook already handled token verification.
  // request.user is set if a valid token was provided, undefined otherwise.
}

/**
 * Get auth plugin options from environment variables
 */
export function getAuthPluginOptionsFromEnv(): AuthPluginOptions {
  const authority = process.env.AUTH_AUTHORITY;
  const audience = process.env.AUTH_AUDIENCE;

  if (!authority || !audience) {
    throw new Error("Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE");
  }

  return {
    authority,
    audience,
    excludePaths: ["/health", "/docs"],
  };
}
