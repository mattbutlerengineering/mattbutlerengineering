import type { FastifyRequest } from "fastify";
import { hasVenueRole } from "@mbe/auth/fastify";
import { actorNameOf } from "../services/actor-name.js";
import type { ClosureCaller } from "../services/closure-command.js";

/**
 * Who is making a closure call. The closure routes admit any venue member
 * (`venueScoped` default) and decide here between Manager (owner, manager or
 * platform admin) and Host, whose limits the store enforces: whole venue,
 * tonight, `Venue.hostEmergencyClose` on (architecture.md § Venue roles).
 */
export async function closureCaller(
  request: FastifyRequest,
  venueId: string,
  isAdmin: boolean
): Promise<ClosureCaller> {
  const sub = request.user?.raw.sub ?? "";
  const role = isAdmin ? null : await request.server.venueRoleLookup(sub, venueId);
  return {
    isManager: isAdmin || hasVenueRole(role, "manager"),
    actorId: request.user?.id ?? "unknown",
    actorName: actorNameOf(request.user),
  };
}

export const CLOSURE_FORBIDDEN =
  "Only a Manager can do this. A Host may close the whole venue for tonight, and only when the venue allows it.";
