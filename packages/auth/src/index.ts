// Re-export types for convenience
export type { OIDCConfig, JWTPayload, AuthUser } from "./types/index.js";

// React exports (tree-shakeable via separate entry point)
export { AuthProvider, useAuth, useAccessToken, useRequireAuth } from "./react/index.js";
export type { AuthProviderProps } from "./react/index.js";

// Fastify exports (tree-shakeable via separate entry point)
export { authPlugin, requireAuth, getAuthPluginOptionsFromEnv } from "./fastify/index.js";
export type { AuthPluginOptions } from "./fastify/index.js";
