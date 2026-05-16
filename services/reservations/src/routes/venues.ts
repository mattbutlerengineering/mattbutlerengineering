import type { FastifyPluginAsync } from "fastify";
import type {
  Venue,
  VenueGroup,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { venueService, venueGroupService } from "../services/venue.js";

export const venueRoutes: FastifyPluginAsync = async (fastify) => {
  // ============ VENUE GROUP ROUTES ============

  // List venue groups
  fastify.get<{
    Querystring: { page?: string; limit?: string };
    Reply: PaginatedResponse<VenueGroup>;
  }>(
    "/groups",
    {
      schema: {
        summary: "List all venue groups",
        operationId: "listVenueGroups",
        description: "Retrieve a paginated list of all venue groups.",
        tags: ["Venue Groups"],
        querystring: {
          type: "object",
          properties: {
            page: {
              type: "string",
              default: "1",
              description: "Page number (1-indexed)",
            },
            limit: {
              type: "string",
              default: "10",
              description: "Number of groups per page (max 100)",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated venue group list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "VenueGroup#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
      return venueGroupService.list(page, limit);
    }
  );

  // Get venue group by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<VenueGroup> | ApiError;
  }>(
    "/groups/:id",
    {
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
    Reply: ApiResponse<VenueGroup> | ApiError;
  }>(
    "/groups",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create a new venue group",
        operationId: "createVenueGroup",
        description: "Create a new venue group. Requires authentication.",
        tags: ["Venue Groups"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Venue group creation payload",
          properties: {
            name: {
              type: "string",
              description: "Venue group name",
            },
            slug: {
              type: "string",
              description: "URL-friendly identifier (must be unique)",
            },
            settings: {
              type: "object",
              description: "Shared settings for all venues in the group",
            },
          },
          required: ["name", "slug"],
        },
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
    Reply: ApiResponse<VenueGroup> | ApiError;
  }>(
    "/groups/:id",
    {
      preHandler: requireAuth,
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
        body: {
          type: "object",
          description: "Fields to update",
          properties: {
            name: { type: "string" },
            slug: { type: "string" },
            settings: { type: "object" },
          },
        },
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
      preHandler: requireAuth,
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
    Reply: PaginatedResponse<Venue>;
  }>(
    "/",
    {
      schema: {
        summary: "List all venues",
        operationId: "listVenues",
        description: "Retrieve a paginated list of all venues. Optionally filter by venue group.",
        tags: ["Venues"],
        querystring: {
          type: "object",
          properties: {
            page: {
              type: "string",
              default: "1",
              description: "Page number (1-indexed)",
            },
            limit: {
              type: "string",
              default: "10",
              description: "Number of venues per page (max 100)",
            },
            venueGroupId: {
              type: "string",
              description: "Filter venues by venue group ID",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated venue list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "Venue#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
      return venueService.list(page, limit, request.query.venueGroupId);
    }
  );

  // Get venue by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Venue> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Get venue by ID",
        operationId: "getVenueById",
        description: "Retrieve a single venue by its unique identifier.",
        tags: ["Venues"],
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

  // Get venue by slug (for public booking)
  fastify.get<{
    Params: { slug: string };
    Reply: ApiResponse<Venue> | ApiError;
  }>(
    "/by-slug/:slug",
    {
      schema: {
        summary: "Get venue by slug",
        operationId: "getVenueBySlug",
        description:
          "Retrieve a single venue by its URL-friendly slug. Used for public booking URLs.",
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
              data: { $ref: "Venue#" },
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
      const venue = await venueService.getBySlug(request.params.slug);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      return { data: venue };
    }
  );

  // Create venue (requires auth)
  fastify.post<{
    Body: CreateVenueRequest;
    Reply: ApiResponse<Venue> | ApiError;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create a new venue",
        operationId: "createVenue",
        description: "Create a new venue. Requires authentication.",
        tags: ["Venues"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Venue creation payload",
          properties: {
            venueGroupId: {
              type: "string",
              description: "ID of the venue group this venue belongs to",
            },
            name: {
              type: "string",
              description: "Venue name",
            },
            slug: {
              type: "string",
              description: "URL-friendly identifier for public booking URLs (must be unique)",
            },
            ianaTimezone: {
              type: "string",
              description: "IANA timezone identifier (e.g., 'America/Los_Angeles')",
            },
            currencyCode: {
              type: "string",
              default: "USD",
              description: "ISO 4217 currency code",
            },
            operatingHours: {
              type: "object",
              description: "Weekly operating schedule",
            },
            settings: {
              type: "object",
              description: "Venue-specific settings",
            },
          },
          required: ["name", "slug", "ianaTimezone"],
        },
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
        const venue = await venueService.create(request.body);
        return reply.code(201).send({ data: venue });
      } catch (error) {
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
    Reply: ApiResponse<Venue> | ApiError;
  }>(
    "/:id",
    {
      preHandler: requireAuth,
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
        body: {
          type: "object",
          description: "Fields to update",
          properties: {
            venueGroupId: { type: "string", nullable: true },
            name: { type: "string" },
            slug: { type: "string" },
            ianaTimezone: { type: "string" },
            currencyCode: { type: "string" },
            operatingHours: { type: "object", nullable: true },
            settings: { type: "object", nullable: true },
          },
        },
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
      preHandler: requireAuth,
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
      const deleted = await venueService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      return reply.code(204).send();
    }
  );
};
