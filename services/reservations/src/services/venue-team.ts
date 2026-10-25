import type { TeamRole, VenueTeam } from "@mbe/types";
import type { PrismaClient, VenueRole } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { prisma } from "./database.js";

/** Owners and managers are a Manager; staff are a Host (no new enum value). */
function toTeamRole(role: VenueRole): TeamRole {
  return role === "staff" ? "host" : "manager";
}

const isManagerRole = (role: VenueRole): boolean => role !== "staff";

/**
 * Raised when a role change would leave the venue with no owner or manager:
 * nobody could then edit hours, close the venue or restore a Manager.
 */
export class LastManagerError extends Error {
  constructor() {
    super("A venue needs at least one Manager");
    this.name = "LastManagerError";
  }
}

/**
 * Raised when a caller who is neither an owner nor a platform admin tries to
 * change an owner's role. A manager demoting an owner would lose the owner
 * marker for good: re-promoting stores `manager`, never `owner`.
 */
export class OwnerProtectedError extends Error {
  constructor() {
    super("Only an owner can change an owner's role");
    this.name = "OwnerProtectedError";
  }
}

/** Who is asking: a platform admin, or their own membership role at the venue. */
export interface TeamCaller {
  readonly isAdmin: boolean;
  readonly role: VenueRole | null;
}

const canChangeOwner = (caller: TeamCaller): boolean => caller.isAdmin || caller.role === "owner";

/**
 * Settings → Team (venue-availability, #7510): who is a Manager or a Host at a
 * venue, and the "Hosts can close in an emergency" grant. Every method takes
 * the venue id the route already authorised and filters on it explicitly.
 */
export function createVenueTeamService(client: PrismaClient = prisma) {
  return {
    /** `null` when the venue does not exist. */
    async get(venueId: string, viewerSub: string, isAdmin: boolean): Promise<VenueTeam | null> {
      const venue = await client.venue.findUnique({
        where: { id: venueId },
        select: { hostEmergencyClose: true },
      });
      if (!venue) return null;
      const rows = await client.venueMembership.findMany({
        where: { venueId },
        select: { userSub: true, role: true },
        orderBy: { createdAt: "asc" },
      });
      const members = rows.map((row) => ({
        userSub: row.userSub,
        role: toTeamRole(row.role),
        isViewer: row.userSub === viewerSub,
        isOwner: row.role === "owner",
      }));
      const own = members.find((member) => member.isViewer);
      return {
        members,
        hostEmergencyClose: venue.hostEmergencyClose,
        viewerRole: isAdmin ? "manager" : (own?.role ?? "host"),
        viewerCanChangeOwners: isAdmin || own?.isOwner === true,
      };
    },

    /**
     * Sets one member's role. `manager` leaves an owner an owner; `host`
     * stores `staff`. Refuses with {@link OwnerProtectedError} any change to an
     * owner's row unless `caller` is an owner or a platform admin, and with
     * {@link LastManagerError} to demote the venue's last owner/manager. The venue's membership rows are locked
     * first, so two Managers demoting each other at once cannot both pass the
     * count. `null` when the user is not a member of this venue.
     */
    async setRole(
      venueId: string,
      userSub: string,
      role: TeamRole,
      caller: TeamCaller
    ): Promise<{ userSub: string; role: TeamRole } | null> {
      return client.$transaction(async (tx) => {
        await setVenueContext(tx, venueId);
        await tx.$queryRaw`SELECT id FROM venue_memberships WHERE venue_id = ${venueId} FOR UPDATE`;
        const key = { userSub_venueId: { userSub, venueId } };
        const current = await tx.venueMembership.findUnique({ where: key });
        if (!current) return null;
        if (current.role === "owner" && !canChangeOwner(caller)) throw new OwnerProtectedError();
        if (toTeamRole(current.role) === role) return { userSub, role };

        if (role === "host") {
          const rows = await tx.venueMembership.findMany({ where: { venueId } });
          const otherManagers = rows.filter(
            (row) => row.userSub !== userSub && isManagerRole(row.role)
          );
          if (otherManagers.length === 0) throw new LastManagerError();
        }
        const stored: VenueRole = role === "host" ? "staff" : "manager";
        await tx.venueMembership.update({ where: key, data: { role: stored } });
        return { userSub, role };
      });
    },

    /** `false` when the venue does not exist. */
    async setHostEmergencyClose(venueId: string, enabled: boolean): Promise<boolean> {
      const { count } = await client.venue.updateMany({
        where: { id: venueId },
        data: { hostEmergencyClose: enabled },
      });
      return count > 0;
    },
  };
}

export type VenueTeamService = ReturnType<typeof createVenueTeamService>;

export const venueTeamService = createVenueTeamService();
