import { createRemoteJWKSet, jwtVerify } from "jose";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
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
  /** Routes to exclude from auth (e.g., ["/health"]) */
  excludePaths?: string[];
}

/**
 * Fastify plugin for JWT validation using OIDC provider's JWKS
 * Uses jose library for standard JWT/JWKS handling (not Auth0-specific)
 * Wrapped with fastify-plugin to break encapsulation - hooks apply to parent context
 */
async function authPluginImpl(
  fastify: FastifyInstance,
  options: AuthPluginOptions
) {
  const { authority, audience, excludePaths = [] } = options;

  // Create JWKS client that fetches keys from OIDC provider
  const jwksUri = `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
  const JWKS = createRemoteJWKSet(new URL(jwksUri));

  // Add authentication hook
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip excluded paths
    if (excludePaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing or invalid authorization header" });
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
      reply.code(401).send({ error: "Invalid token" });
    }
  });
}

export const authPlugin = fp(authPluginImpl, {
  name: "@mbe/auth",
  fastify: "5.x",
});

/**
 * Require authentication for a specific route
 * Use as a preHandler on routes that need auth
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    reply.code(401).send({ error: "Authentication required" });
  }
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
    excludePaths: ["/health", "/api/v1/docs"],
  };
}
