// Re-export types for convenience
export type { OIDCConfig, JWTPayload, AuthUser } from "./types/index.js";

// React exports (tree-shakeable via separate entry point)
export { AuthProvider, useAuth, useAccessToken, useRequireAuth } from "./react/index.js";
export type { AuthProviderProps, AccessTokenState } from "./react/index.js";

// Fastify exports (tree-shakeable via separate entry point)
export {
  authPlugin,
  requireAuth,
  getAuthPluginOptionsFromEnv,
  requireOwnershipOrAdmin,
  requireAdmin,
  requireVenueAccess,
} from "./fastify/index.js";
export type {
  AuthPluginOptions,
  JwtVerifier,
  OwnerResolver,
  AuthorizationContext,
  OwnershipOptions,
  VenueIdResolver,
  VenueMembershipLookup,
} from "./fastify/index.js";
