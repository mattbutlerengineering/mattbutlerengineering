import { z } from "zod";

/**
 * The two staff roles Settings → Team shows (venue-availability, #7510).
 * `VenueMembership.role` keeps its three values: `owner` and `manager` are a
 * Manager, `staff` is a Host. No new enum value is stored.
 */
export const TEAM_ROLES = ["manager", "host"] as const;

export const TeamRoleSchema = z.enum(TEAM_ROLES);

/** One venue member. Members are keyed by their Auth0 `sub`; the service stores no name or email. */
export const TeamMemberSchema = z.object({
  userSub: z.string(),
  role: TeamRoleSchema,
  /** True for the caller's own membership row. */
  isViewer: z.boolean(),
});

/** `GET /api/v1/venues/:id/team`. */
export const VenueTeamSchema = z.object({
  members: z.array(TeamMemberSchema),
  /** "Hosts can close in an emergency" (`Venue.hostEmergencyClose`). */
  hostEmergencyClose: z.boolean(),
  /** The caller's role at this venue; platform admins count as a Manager. */
  viewerRole: TeamRoleSchema,
});

/** `PATCH /api/v1/venues/:id/team/members/:userSub`. */
export const UpdateTeamMemberRoleRequestSchema = z.object({ role: TeamRoleSchema });

/** `PATCH /api/v1/venues/:id/team`: the Host emergency-close grant. */
export const UpdateVenueTeamRequestSchema = z.object({ hostEmergencyClose: z.boolean() });

export type TeamRole = z.infer<typeof TeamRoleSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type VenueTeam = z.infer<typeof VenueTeamSchema>;
export type UpdateTeamMemberRoleRequest = z.infer<typeof UpdateTeamMemberRoleRequestSchema>;
export type UpdateVenueTeamRequest = z.infer<typeof UpdateVenueTeamRequestSchema>;
