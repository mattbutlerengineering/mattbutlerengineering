import type { FastifyPluginAsync } from "fastify";
import type {
  Venue,
  VenueGroup,
  PublicVenue,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
  ApiResponse,
  ProblemDetails,
  PaginatedResponse,
  TableStatusDelta,
} from "@mbe/types";
import {
  createProblemDetails,
  listVenueGroupsQueryJsonSchema,
  createVenueGroupBodyJsonSchema,
  updateVenueGroupBodyJsonSchema,
  listVenuesQueryJsonSchema,
  createVenueBodyJsonSchema,
  updateVenueBodyJsonSchema,
  publicVenueJsonSchema,
} from "@mbe/types";
import {
  requireAuth,
  requireAdmin,
  requireVenueAccess,
  requireVenueCreateAccess,
  hasPermission,
  type VenueIdResolver,
} from "@mbe/auth/fastify";
import { parsePaginationQuery, createListResponseSchema } from "@mbe/database";
import {
  venueService,
  venueGroupService,
  VenueBootstrapForbiddenError,
} from "../services/venue.js";
import { tableStatusService } from "../services/table-status.js";

/**
 * Reads a venue's own id from the `:id` route param, so requireVenueAccess can
 * scope venue self-management (update) to that venue's members.
 */
const venueIdFromRouteId: VenueIdResolver = (request) => {
  const params = request.params as { id?: unknown };
  return typeof params.id === "string" ? params.id : null;
};

/**
 * A transaction that lost a serialization race. Prisma surfaces this as
 * `P2034`; the underlying Postgres SQLSTATE is `40001`. Both are checked
 * because a raw-query path would carry the SQLSTATE instead.
 */
function isWriteConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2034" || code === "40001";
}

export const venueRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema(publicVenueJsonSchema);

  // ============ VENUE GROUP ROUTES ============

  // List venue groups
  fastify.get<{
    Querystring: { page?: string; limit?: string };
    Reply: PaginatedResponse<VenueGroup>;
  }>(
    "/groups",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "List all venue groups",
        operationId: "listVenueGroups",
        description: "Retrieve a paginated list of all venue groups.",
        tags: ["Venue Groups"],
        querystring: listVenueGroupsQueryJsonSchema,
        response: {
          200: {
            description: "Successful response with paginated venue group list",
            ...createListResponseSchema("VenueGroup#"),
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const { page, limit } = parsePaginationQuery(request.query);
      return venueGroupService.list(page, limit);
    }
  );

  // Get venue group by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<VenueGroup> | ProblemDetails;
  }>(
    "/groups/:id",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Get venue group by ID",
        operationId: "getVenueGroupById",
        description: "Retrieve a single venue group by its unique identifier.",
        tags: ["Venue Groups"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue group identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Venue group found",
            type: "object",
            properties: {
              data: { $ref: "VenueGroup#" },
            },
          },
          404: {
            description: "Venue group not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const group = await venueGroupService.getById(request.params.id);
      if (!group) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Venue group not found"));
      }
      return { data: group };
    }
  );

  // Create venue group (requires auth)
  fastify.post<{
    Body: CreateVenueGroupRequest;
    Reply: ApiResponse<VenueGroup> | ProblemDetails;
  }>(
    "/groups",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Create a new venue group",
        operationId: "createVenueGroup",
        description: "Create a new venue group. Requires authentication.",
        tags: ["Venue Groups"],
        security: [{ bearerAuth: [] }],
        body: createVenueGroupBodyJsonSchema,
        response: {
          201: {
            description: "Venue group created successfully",
            type: "object",
            properties: {
              data: { $ref: "VenueGroup#" },
            },
          },
          400: {
            description: "Invalid request body or slug already exists",
            $ref: "Error#",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const group = await venueGroupService.create(request.body);
        return reply.code(201).send({ data: group });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                "A venue group with this slug already exists"
              )
            );
        }
        throw error;
      }
    }
  );

  // Update venue group (requires auth)
  fastify.patch<{
    Params: { id: string };
    Body: UpdateVenueGroupRequest;
    Reply: ApiResponse<VenueGroup> | ProblemDetails;
  }>(
    "/groups/:id",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Update a venue group",
        operationId: "updateVenueGroup",
        description:
          "Update an existing venue group. Only provided fields will be updated. Requires authentication.",
        tags: ["Venue Groups"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue group identifier",
            },
          },
          required: ["id"],
        },
        body: updateVenueGroupBodyJsonSchema,
        response: {
          200: {
            description: "Venue group updated successfully",
            type: "object",
            properties: {
              data: { $ref: "VenueGroup#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Venue group not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const group = await venueGroupService.update(request.params.id, request.body);
      if (!group) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Venue group not found"));
      }
      return { data: group };
    }
  );

  // Delete venue group (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/groups/:id",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Delete a venue group",
        operationId: "deleteVenueGroup",
        description:
          "Delete a venue group. This will fail if the group has venues. Requires authentication.",
        tags: ["Venue Groups"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue group identifier",
            },
          },
          required: ["id"],
        },
        response: {
          204: {
            description: "Venue group deleted successfully",
            type: "null",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Venue group not found",
            $ref: "Error#",
          },
          409: {
            description: "Venue group has venues and cannot be deleted",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const deleted = await venueGroupService.delete(request.params.id);
      if (!deleted) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Venue group not found"));
      }
      return reply.code(204).send();
    }
  );

  // ============ VENUE ROUTES ============

  // List venues
  fastify.get<{
    Querystring: { page?: string; limit?: string; venueGroupId?: string };
    Reply: PaginatedResponse<Venue> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List venues visible to the caller",
        operationId: "listVenues",
        description:
          "Returns the venues the authenticated caller may see: platform admins get every venue, " +
          "other operators get only the venues they are a member of (own or were invited to). " +
          "Optionally filter by venue group.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        querystring: listVenuesQueryJsonSchema,
        response: {
          200: {
            description: "Successful response with paginated venue list",
            ...createListResponseSchema("Venue#"),
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const { page, limit } = parsePaginationQuery(request.query);
      const { venueGroupId } = request.query;
      const user = request.user;

      // requireAuth guarantees an identity; this satisfies the type narrower
      // and fails closed if the guard is ever removed.
      if (!user) {
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Authentication required"));
      }

      // Platform admins are scoped to every venue (matches requireVenueAccess,
      // ADR-020); everyone else sees only venues they belong to.
      if (hasPermission(user, "admin")) {
        return venueService.list(page, limit, venueGroupId);
      }
      return venueService.listForMember(user.raw.sub, page, limit, venueGroupId);
    }
  );

  // Get venue by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Venue> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, venueIdFromRouteId),
      ],
      schema: {
        summary: "Get venue by ID",
        operationId: "getVenueById",
        description: "Retrieve a single venue by its unique identifier.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Venue found",
            type: "object",
            properties: {
              data: { $ref: "Venue#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          403: {
            description: "Caller does not have access to this venue",
            $ref: "Error#",
          },
          404: {
            description: "Venue not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const venue = await venueService.getById(request.params.id);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      return { data: venue };
    }
  );

  // Get current derived table-status snapshot for the venue (staff-only —
  // reconnect resync for the floor plan's live status map, #3931)
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<TableStatusDelta[]> | ProblemDetails;
  }>(
    "/:id/table-statuses",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, venueIdFromRouteId),
      ],
      schema: {
        summary: "Get current table-status snapshot for a venue",
        operationId: "getVenueTableStatuses",
        description:
          "Returns the current derived display status for every table in the venue — " +
          "the snapshot a reconnecting SSE client refetches to replace any " +
          "table-status:changed deltas lost while disconnected.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Current table-status snapshot",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tableId: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["available", "seated", "needs-bussing", "reserved-soon"],
                    },
                  },
                  required: ["tableId", "status"],
                },
              },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          403: {
            description: "Caller does not have access to this venue",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const snapshot = await tableStatusService.getSnapshot(request.params.id);
      return { data: snapshot };
    }
  );

  // Get venue by slug (unauthenticated — curated public projection, #4022).
  // This is the booking widget's venue-resolution entry point; it must never
  // return the internal Venue (venueGroup, venueGroupId, raw settings blob).
  fastify.get<{
    Params: { slug: string };
    Reply: ApiResponse<PublicVenue> | ProblemDetails;
  }>(
    "/by-slug/:slug",
    {
      schema: {
        summary: "Get public venue projection by slug",
        operationId: "getVenueBySlug",
        description:
          "Retrieve a venue's curated public projection by its URL-friendly slug. Used for public booking URLs.",
        tags: ["Venues"],
        params: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "Venue slug",
            },
          },
          required: ["slug"],
        },
        response: {
          200: {
            description: "Venue found",
            type: "object",
            properties: {
              data: { $ref: "PublicVenue#" },
            },
          },
          404: {
            description: "Venue not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const venue = await venueService.getPublicBySlug(request.params.slug);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      return { data: venue };
    }
  );

  // Create venue (requires auth)
  fastify.post<{
    Body: CreateVenueRequest;
    Reply: ApiResponse<Venue> | ProblemDetails;
  }>(
    "/",
    {
      // ADR-020 third case: admins as before, PLUS an authenticated identity
      // holding no venue membership at all creating its first venue. Every
      // other venue route keeps requireAdmin / requireVenueAccess unchanged.
      preHandler: [requireAuth, requireVenueCreateAccess(fastify.hasAnyVenueMembership)],
      schema: {
        summary: "Create a new venue",
        operationId: "createVenue",
        description: "Create a new venue. Requires authentication.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        body: createVenueBodyJsonSchema,
        response: {
          201: {
            description: "Venue created successfully",
            type: "object",
            properties: {
              data: { $ref: "Venue#" },
            },
          },
          400: {
            description: "Invalid request body or slug already exists",
            $ref: "Error#",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // requireVenueCreateAccess ran, so request.user is set; seed the creator
        // as the venue owner (VenueMembership) so it appears in their scoped
        // list (#3069). The guard read membership OUTSIDE the transaction that
        // establishes it, so the service re-checks inside — but only for
        // non-admins, which is why the caller's role is threaded through.
        const venue = await venueService.create(request.body, request.user?.raw.sub, {
          isAdmin: request.user ? hasPermission(request.user, "admin") : false,
        });
        return reply.code(201).send({ data: venue });
      } catch (error) {
        if (error instanceof VenueBootstrapForbiddenError) {
          return reply
            .code(403)
            .send(
              createProblemDetails(
                403,
                "Forbidden",
                "Admin role required to create additional venues"
              )
            );
        }
        // Serializable isolation aborts the loser of a concurrent bootstrap
        // (Prisma P2034 / Postgres 40001). That is retryable, not a server bug.
        if (isWriteConflict(error)) {
          return reply
            .code(409)
            .send(
              createProblemDetails(
                409,
                "Conflict",
                "Concurrent venue creation conflicted; retry the request"
              )
            );
        }
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return reply
            .code(400)
            .send(
              createProblemDetails(400, "Bad Request", "A venue with this slug already exists")
            );
        }
        throw error;
      }
    }
  );

  // Update venue (requires auth)
  fastify.patch<{
    Params: { id: string };
    Body: UpdateVenueRequest;
    Reply: ApiResponse<Venue> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, venueIdFromRouteId),
      ],
      schema: {
        summary: "Update a venue",
        operationId: "updateVenue",
        description:
          "Update an existing venue. Only provided fields will be updated. Requires authentication.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue identifier",
            },
          },
          required: ["id"],
        },
        body: updateVenueBodyJsonSchema,
        response: {
          200: {
            description: "Venue updated successfully",
            type: "object",
            properties: {
              data: { $ref: "Venue#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Venue not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const venue = await venueService.update(request.params.id, request.body);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      return { data: venue };
    }
  );

  // Delete venue (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Delete a venue",
        operationId: "deleteVenue",
        description:
          "Delete a venue. This will fail if the venue has tables or reservations. Requires authentication.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique venue identifier",
            },
          },
          required: ["id"],
        },
        response: {
          204: {
            description: "Venue deleted successfully",
            type: "null",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Venue not found",
            $ref: "Error#",
          },
          409: {
            description: "Venue has tables or reservations and cannot be deleted",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const outcome = await venueService.delete(request.params.id);
      if (outcome === "not_found") {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      if (outcome === "has_dependents") {
        return reply
          .code(409)
          .send(
            createProblemDetails(
              409,
              "Conflict",
              "Venue has tables or reservations and cannot be deleted"
            )
          );
      }
      return reply.code(204).send();
    }
  );
};
