import { z } from "zod";
import type { TeamRole, VenueTeam } from "@mbe/types";
import { TeamRoleSchema, UpdateVenueTeamRequestSchema, VenueTeamSchema } from "@mbe/types";
import type { ApiClient } from "./client.js";

const memberRoleSchema = z.object({ userSub: z.string(), role: TeamRoleSchema });

/** `/api/v1/venues/:id/team[/...]` — a module function so it is not mistaken for a client method. */
function teamPath(venueId: string, ...segments: string[]): string {
  return ["/api/v1/venues", ...[venueId, "team", ...segments].map(encodeURIComponent)].join("/");
}

/**
 * Settings → Team: members' Manager / Host roles and the Host emergency-close
 * grant. Paths match `services/reservations/src/routes/venue-team.ts`.
 */
export class VenueTeamClient {
  constructor(private client: ApiClient) {}

  async get(venueId: string): Promise<VenueTeam> {
    return this.client.getOne<VenueTeam>(teamPath(venueId), undefined, VenueTeamSchema);
  }

  /** Needs Manager. A 409 means the change would leave the venue with no Manager. */
  async setRole(
    venueId: string,
    userSub: string,
    role: TeamRole
  ): Promise<{ userSub: string; role: TeamRole }> {
    return this.client.patchOne(teamPath(venueId, "members", userSub), { role }, memberRoleSchema);
  }

  /** Needs Manager. Resolves to the stored grant. */
  async setHostEmergencyClose(venueId: string, enabled: boolean): Promise<boolean> {
    const result = await this.client.patchOne(
      teamPath(venueId),
      { hostEmergencyClose: enabled },
      UpdateVenueTeamRequestSchema
    );
    return result.hostEmergencyClose;
  }
}
