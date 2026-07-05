import type { FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails, titleForStatus } from "@mbe/types";
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
 * when the resource does not exist. A null owner denies non-admins with a 403
 * by default, or a 404 under `{ denial: "hide" }` (existence-hiding).
 */
export type OwnerResolver = (request: FastifyRequest) => Promise<string | null>;

export interface OwnershipOptions {
  /**
   * How to respond when the caller is denied access.
   * - "forbid" (default): 403 for a non-owner or null owner, 401 when the
   *   current identity is unresolvable. The resource is known to exist and the
   *   caller simply lacks access.
   * - "hide": 404 for every denial (non-owner, null owner, unresolvable
   *   identity). Existence-hiding — a deny is indistinguishable from a genuine
   *   not-found, so unauthorized callers learn nothing about the resource.
   */
  denial?: "forbid" | "hide";
}

/**
 * Sends the denial response. Under "hide" every denial collapses to a 404 that
 * is byte-for-byte identical to a genuine not-found, leaking nothing about the
 * resource's existence or the reason for the denial. Under "forbid" the caller
 * gets the precise status (401 unresolvable identity, 403 not an owner).
 */
function denyRequest(
  reply: FastifyReply,
  denial: "forbid" | "hide",
  forbidStatus: 401 | 403
): void {
  if (denial === "hide") {
    reply.code(404).send(createProblemDetails(404, titleForStatus(404), "Resource not found"));
    return;
  }
  const detail =
    forbidStatus === 401 ? "Authentication required" : "You do not have access to this resource";
  reply
    .code(forbidStatus)
    .send(createProblemDetails(forbidStatus, titleForStatus(forbidStatus), detail));
}

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
 * @param options.denial - "forbid" (default) uses 401/403; "hide" collapses
 *   every denial to 404 so the resource's existence is never revealed.
 *
 * Decision matrix (denial: "forbid" — the default):
 *   - admin → allow, skip both resolvers
 *   - non-admin + resolveCurrentId returns null → 401 (identity unresolvable)
 *   - non-admin + resolveOwnerId === resolveCurrentId → allow, isOwner=true
 *   - non-admin + ids differ or resolveOwnerId is null → 403
 *   With denial: "hide", both the 401 and 403 outcomes become 404 instead.
 */
export function requireOwnershipOrAdmin(
  resolveOwnerId: OwnerResolver,
  resolveCurrentId: OwnerResolver = (req) => Promise.resolve(req.user?.id ?? null),
  options: OwnershipOptions = {}
) {
  const denial = options.denial ?? "forbid";

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
      denyRequest(reply, denial, 401);
      return;
    }

    const isOwner = ownerId !== null && ownerId === currentId;

    if (!isOwner) {
      denyRequest(reply, denial, 403);
      return;
    }

    request.authorization = { isAdmin: false, isOwner: true };
  };
}
