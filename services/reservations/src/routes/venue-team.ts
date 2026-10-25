import type { FastifyPluginAsync } from "fastify";
import {
  type ProblemDetails,
  type TeamRole,
  type UpdateTeamMemberRoleRequest,
  type UpdateVenueTeamRequest,
  type VenueTeam,
  createProblemDetails,
  updateTeamMemberRoleBodyJsonSchema,
  updateVenueTeamBodyJsonSchema,
  venueTeamResponseJsonSchema,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { LastManagerError, OwnerProtectedError } from "../services/venue-team.js";
import { venueScoped } from "./venue-scope.js";

/** The team routes address the venue by its own `:id`, like the venue self-routes. */
const venueFromRouteId = { venue: { from: "params", field: "id" } } as const;
const venueManagerFromRouteId = { ...venueFromRouteId, access: "manager" } as const;

const VENUE_NOT_FOUND = "Venue not found";
const MEMBER_NOT_FOUND = "This person is not a member of this venue";

const idParams = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
};

/**
 * Settings → Team (venue-availability, #7510): each member's Manager / Host
 * role and the "Hosts can close in an emergency" grant. Any member reads;
 * writes need Manager (owner or manager membership, admins bypass).
 */
export const venueTeamRoutes: FastifyPluginAsync = async (fastify) => {
  const { venueTeamService } = fastify.services;

  fastify.get<{ Params: { id: string }; Reply: { data: VenueTeam } | ProblemDetails }>(
    "/:id/team",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List a venue's team with each member's role",
        tags: ["Venues"],
        params: idParams,
        response: { 200: { type: "object", properties: { data: venueTeamResponseJsonSchema } } },
      },
    },
    venueScoped(venueFromRouteId, async (request, reply, { venueId, isAdmin }) => {
      const team = await venueTeamService.get(venueId, request.user?.raw.sub ?? "", isAdmin);
      if (!team) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      return { data: team };
    })
  );

  fastify.patch<{
    Params: { id: string };
    Body: UpdateVenueTeamRequest;
    Reply: { data: UpdateVenueTeamRequest } | ProblemDetails;
  }>(
    "/:id/team",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Set whether Hosts can close the venue in an emergency",
        tags: ["Venues"],
        params: idParams,
        body: updateVenueTeamBodyJsonSchema,
      },
    },
    venueScoped(venueManagerFromRouteId, async (request, reply, { venueId }) => {
      const { hostEmergencyClose } = request.body;
      if (!(await venueTeamService.setHostEmergencyClose(venueId, hostEmergencyClose))) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      return { data: { hostEmergencyClose } };
    })
  );

  fastify.patch<{
    Params: { id: string; userSub: string };
    Body: UpdateTeamMemberRoleRequest;
    Reply: { data: { userSub: string; role: TeamRole } } | ProblemDetails;
  }>(
    "/:id/team/members/:userSub",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Make a member a Manager or a Host",
        description:
          "Refuses with 403 when a non-owner changes an owner's role, and with 409 when the change would leave the venue without an owner or manager.",
        tags: ["Venues"],
        params: {
          type: "object",
          properties: { id: { type: "string" }, userSub: { type: "string" } },
          required: ["id", "userSub"],
        },
        body: updateTeamMemberRoleBodyJsonSchema,
      },
    },
    venueScoped(venueManagerFromRouteId, async (request, reply, { venueId, isAdmin }) => {
      // The caller's own role decides whether they may touch an owner's row;
      // an admin passes without a lookup, as in `requireVenueRole`.
      const callerRole = isAdmin
        ? null
        : await request.server.venueRoleLookup(request.user?.raw.sub ?? "", venueId);
      try {
        const member = await venueTeamService.setRole(
          venueId,
          request.params.userSub,
          request.body.role,
          { isAdmin, role: callerRole }
        );
        if (!member) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", MEMBER_NOT_FOUND));
        }
        return { data: member };
      } catch (error) {
        if (error instanceof OwnerProtectedError) {
          return reply.code(403).send(createProblemDetails(403, "Forbidden", error.message));
        }
        if (error instanceof LastManagerError) {
          return reply.code(409).send(createProblemDetails(409, "Conflict", error.message));
        }
        throw error;
      }
    })
  );
};
