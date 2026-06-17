import type { FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { hasPermission } from "./plugin.js";

/**
 * Authorization context attached by requireOwnershipOrAdmin.
 * Handlers can read request.authorization to branch on admin vs owner status.
 */
export interface AuthorizationContext {
  isAdmin: boolean;
  isOwner: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    authorization?: AuthorizationContext;
  }
}

/**
 * OwnerResolver receives the current request and must return the id of the
 * resource owner in the same identity space as resolveCurrentId. Returns null
 * when the resource does not exist; null triggers a 403 (not 404) to avoid
 * leaking resource existence to non-owners.
 */
export type OwnerResolver = (request: FastifyRequest) => Promise<string | null>;

/**
 * PreHandler factory for routes that allow access to the resource owner OR any admin.
 *
 * Assumes `requireAuth` ran first (request.user is guaranteed set).
 * Attaches `request.authorization = { isAdmin, isOwner }` so route handlers
 * can consult the context without re-deriving it.
 *
 * @param resolveOwnerId - Returns the resource owner's id, or null if not found.
 * @param resolveCurrentId - Returns the requesting user's id in the same space
 *   as resolveOwnerId. Defaults to `request.user.id` (JWT sub). Override when
 *   the service uses a different identity key (e.g., a database cuid).
 *
 * Decision matrix:
 *   - admin → allow, skip both resolvers
 *   - non-admin + resolveCurrentId returns null → 401 (identity unresolvable)
 *   - non-admin + resolveOwnerId === resolveCurrentId → allow, isOwner=true
 *   - non-admin + ids differ or resolveOwnerId is null → 403
 */
export function requireOwnershipOrAdmin(
  resolveOwnerId: OwnerResolver,
  resolveCurrentId: OwnerResolver = (req) => Promise.resolve(req.user?.id ?? null)
) {
  return async function ownershipOrAdminHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user;
    const isAdmin = hasPermission(user, "admin");

    if (isAdmin) {
      request.authorization = { isAdmin: true, isOwner: false };
      return;
    }

    const [ownerId, currentId] = await Promise.all([
      resolveOwnerId(request),
      resolveCurrentId(request),
    ]);

    if (currentId === null) {
      reply.code(401).send(createProblemDetails(401, "Unauthorized", "Authentication required"));
      return;
    }

    const isOwner = ownerId !== null && ownerId === currentId;

    if (!isOwner) {
      reply
        .code(403)
        .send(createProblemDetails(403, "Forbidden", "You do not have access to this resource"));
      return;
    }

    request.authorization = { isAdmin: false, isOwner: true };
  };
}
