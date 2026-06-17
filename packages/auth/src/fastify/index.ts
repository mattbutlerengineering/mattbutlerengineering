export {
  authPlugin,
  requireAuth,
  optionalAuth,
  getAuthPluginOptionsFromEnv,
  hasPermission,
} from "./plugin.js";
export type { AuthPluginOptions } from "./plugin.js";
export type { AuthUser } from "../types/index.js";
export { requireOwnershipOrAdmin } from "./ownership.js";
export type { OwnerResolver, AuthorizationContext } from "./ownership.js";
