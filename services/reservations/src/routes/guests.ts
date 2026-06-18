import type { FastifyPluginAsync } from "fastify";
import type {
  Guest,
  LapsingGuest,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSegment,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { guestService } from "../services/guest.js";
import { venueService } from "../services/venue.js";
import { sendWinBack } from "../services/win-back.js";

export const guestRoutes: FastifyPluginAsync = async (fastify) => {
  // List guests for a venue
  fastify.get<{
    Querystring: { venueId: string; page?: string; limit?: string };
    Reply: PaginatedResponse<Guest> | ApiError;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List guests for a venue",
        operationId: "listGuests",
        description:
          "Retrieve a paginated list of guests for a specific venue. Requires authentication.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: { type: "string", description: "Venue ID to list guests for" },
            page: { type: "string", default: "1", description: "Page number (1-indexed)" },
            limit: {
              type: "string",
              default: "20",
              description: "Number of guests per page (max 100)",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated guest list",
            type: "object",
            properties: {
              data: { type: "array", items: { $ref: "Guest#" } },
              pagination: { $ref: "Pagination#" },
            },
          },
          401: { description: "Authentication required", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.query;
      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId is required"));
      }
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "20", 10) || 20));
      return guestService.list(venueId, page, limit);
    }
  );

  // Search guests
  fastify.get<{
    Querystring: { venueId: string; query?: string; tags?: string; hasNotVisitedInDays?: string };
    Reply: PaginatedResponse<Guest> | ApiError;
  }>(
    "/search",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Search guests",
        operationId: "searchGuests",
        description: "Search guests by name, email, phone, or filter by tags and visit history.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: { type: "string", description: "Venue ID to search within" },
            query: { type: "string", description: "Search term (matches name, email, or phone)" },
            tags: { type: "string", description: "Comma-separated tags to filter by" },
            hasNotVisitedInDays: {
              type: "string",
              description: "Filter guests who haven't visited in X days",
            },
          },
        },
        response: {
          200: {
            description: "Search results",
            type: "object",
            properties: {
              data: { type: "array", items: { $ref: "Guest#" } },
              pagination: { $ref: "Pagination#" },
            },
          },
          401: { description: "Authentication required", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId, query, tags, hasNotVisitedInDays } = request.query;
      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId is required"));
      }
      return guestService.search({
        venueId,
        query,
        tags: tags ? tags.split(",") : undefined,
        hasNotVisitedInDays: hasNotVisitedInDays ? parseInt(hasNotVisitedInDays, 10) : undefined,
      });
    }
  );

  // Get guest segments
  fastify.get<{
    Querystring: { venueId: string };
    Reply: ApiResponse<GuestSegment[]> | ApiError;
  }>(
    "/segments",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get guest segments",
        operationId: "getGuestSegments",
        description: "Get guest segments (VIP, At Risk, Lapsed, etc.) for a venue.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: { type: "string", description: "Venue ID to get segments for" },
          },
        },
        response: {
          200: {
            description: "Guest segments",
            type: "object",
            properties: {
              data: { type: "array", items: { $ref: "GuestSegment#" } },
            },
          },
          401: { description: "Authentication required", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.query;
      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId is required"));
      }
      const segments = await guestService.getSegments(venueId);
      return { data: segments };
    }
  );

  // Get guest by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Guest> | ApiError;
  }>(
    "/:id",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get guest by ID",
        operationId: "getGuestById",
        description: "Retrieve a single guest by ID.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", description: "Guest ID" } },
          required: ["id"],
        },
        response: {
          200: {
            description: "Guest found",
            type: "object",
            properties: { data: { $ref: "Guest#" } },
          },
          404: { description: "Guest not found", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const guest = await guestService.getById(request.params.id);
      if (!guest) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Guest not found"));
      }
      return { data: guest };
    }
  );

  // Create guest
  fastify.post<{
    Body: CreateGuestRequest;
    Reply: ApiResponse<Guest> | ApiError;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create a new guest",
        operationId: "createGuest",
        description: "Create a new guest. Requires authentication.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["venueId", "name"],
          properties: {
            venueId: { type: "string", description: "Venue ID" },
            email: { type: "string", format: "email", description: "Guest email" },
            phone: { type: "string", description: "Guest phone" },
            name: { type: "string", description: "Guest name" },
            notes: { type: "string", description: "Internal notes" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
            dietaryRestrictions: {
              type: "array",
              items: { type: "string" },
              description: "Dietary restrictions (e.g. gluten-free, vegan, nut-allergy)",
            },
          },
        },
        response: {
          201: {
            description: "Guest created",
            type: "object",
            properties: { data: { $ref: "Guest#" } },
          },
          400: { description: "Invalid request or duplicate email/phone", $ref: "Error#" },
          401: { description: "Authentication required", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const guest = await guestService.create(request.body);
        return reply.code(201).send({ data: guest });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                "A guest with this email or phone already exists at this venue"
              )
            );
        }
        throw error;
      }
    }
  );

  // Find or create guest (identity resolution)
  fastify.post<{
    Body: {
      venueId: string;
      email?: string;
      phone?: string;
      name: string;
      dietaryRestrictions?: string[];
    };
    Reply: ApiResponse<Guest> | ApiError;
  }>(
    "/find-or-create",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Find or create guest",
        operationId: "findOrCreateGuest",
        description:
          "Find existing guest by email/phone or create new one. Used for identity resolution when booking.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["venueId", "name"],
          properties: {
            venueId: { type: "string", description: "Venue ID" },
            email: {
              type: "string",
              format: "email",
              description: "Guest email (used for matching)",
            },
            phone: {
              type: "string",
              description: "Guest phone (used for matching if email not found)",
            },
            name: { type: "string", description: "Guest name" },
            dietaryRestrictions: {
              type: "array",
              items: { type: "string" },
              description: "Dietary restrictions to merge with existing guest profile",
            },
          },
        },
        response: {
          200: {
            description: "Guest found or created",
            type: "object",
            properties: { data: { $ref: "Guest#" } },
          },
          400: { description: "Invalid request", $ref: "Error#" },
          401: { description: "Authentication required", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId, email, phone, name, dietaryRestrictions } = request.body;
      if (!email && !phone) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "Either email or phone is required"));
      }
      const guest = await guestService.findOrCreate(venueId, {
        email,
        phone,
        name,
        dietaryRestrictions,
      });
      return { data: guest };
    }
  );

  // Update guest
  fastify.patch<{
    Params: { id: string };
    Body: UpdateGuestRequest;
    Reply: ApiResponse<Guest> | ApiError;
  }>(
    "/:id",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Update a guest",
        operationId: "updateGuest",
        description: "Update guest information. Requires authentication.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", description: "Guest ID" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            email: { type: "string", format: "email", nullable: true },
            phone: { type: "string", nullable: true },
            name: { type: "string" },
            notes: { type: "string", nullable: true },
            tags: { type: "array", items: { type: "string" }, nullable: true },
            dietaryRestrictions: {
              type: "array",
              items: { type: "string" },
              nullable: true,
              description: "Dietary restrictions (replaces existing list)",
            },
          },
        },
        response: {
          200: {
            description: "Guest updated",
            type: "object",
            properties: { data: { $ref: "Guest#" } },
          },
          404: { description: "Guest not found", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const guest = await guestService.update(request.params.id, request.body);
      if (!guest) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Guest not found"));
      }
      return { data: guest };
    }
  );

  // Add staff note to guest
  fastify.post<{
    Params: { id: string };
    Body: { text: string };
    Reply: ApiResponse<Guest> | ApiError;
  }>(
    "/:id/notes",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Add a staff note to a guest",
        operationId: "addGuestNote",
        description:
          "Append a staff note to a guest profile. Notes include the authenticated user's identity and a timestamp. Staff notes are only visible on authenticated endpoints.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Guest ID",
            },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["text"],
          properties: {
            text: {
              type: "string",
              minLength: 1,
              description: "Note text",
            },
          },
        },
        response: {
          201: {
            description: "Note appended; returns updated guest",
            type: "object",
            properties: {
              data: { $ref: "Guest#" },
            },
          },
          400: {
            description: "Invalid request",
            $ref: "Error#",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Guest not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const { text } = request.body;
      if (!text || text.trim().length === 0) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "text is required"));
      }
      const createdBy = request.user?.id ?? "unknown";
      const guest = await guestService.addNote(request.params.id, text, createdBy);
      if (!guest) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Guest not found"));
      }
      return reply.code(201).send({ data: guest });
    }
  );

  // Get lapsing guests for a venue (on-demand scan)
  fastify.get<{
    Querystring: { venueId: string };
    Reply: ApiResponse<LapsingGuest[]> | ApiError;
  }>(
    "/lapsing",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get lapsing guests",
        operationId: "getLapsingGuests",
        description:
          "Run lapse detection and return guests who haven't visited in > 2x their average frequency.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: { type: "string", description: "Venue ID to scan" },
          },
        },
        response: {
          200: {
            description: "Lapsing guests list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    guestId: { type: "string" },
                    name: { type: "string" },
                    email: { type: "string", nullable: true },
                    phone: { type: "string", nullable: true },
                    communicationPreference: { type: "string" },
                    avgFrequencyDays: { type: "number" },
                    daysSinceLastVisit: { type: "number" },
                    daysOverdue: { type: "number" },
                  },
                },
              },
            },
          },
          400: { $ref: "Error#" },
          401: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.query;
      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId is required"));
      }
      const lapsing = await guestService.scanLapsedGuests(venueId);
      return { data: lapsing };
    }
  );

  // Send win-back message to a guest
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<{ sent: boolean }> | ApiError;
  }>(
    "/:id/win-back",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Send win-back message",
        operationId: "sendGuestWinBack",
        description:
          "Send a personalized win-back message to a lapsing guest. Skipped if communicationPreference is transactional_only.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Guest ID" },
          },
        },
        response: {
          200: {
            description: "Win-back result",
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  sent: { type: "boolean" },
                },
              },
            },
          },
          404: { $ref: "Error#" },
          401: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const guest = await guestService.getById(request.params.id);
      if (!guest) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Guest not found"));
      }
      const venue = await venueService.getById(guest.venueId);
      const venueName = venue?.name ?? guest.venueId;
      const sent = await sendWinBack(guest, fastify.notificationPort, venueName);
      return { data: { sent } };
    }
  );

  // Delete guest
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Delete a guest",
        operationId: "deleteGuest",
        description: "Delete a guest. Will fail if guest has reservations.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", description: "Guest ID" } },
          required: ["id"],
        },
        response: {
          204: { description: "Guest deleted", type: "null" },
          404: { description: "Guest not found", $ref: "Error#" },
          409: { description: "Guest has reservations", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const deleted = await guestService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Guest not found"));
      }
      return reply.code(204).send();
    }
  );
};
