import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type {
  Guest,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSegment,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import type { AuthUser, JWTPayload } from "@mbe/auth/types";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { guestService } from "../services/guest.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const guestRoutes: FastifyPluginAsync = async (fastify) => {
  const authority = process.env.AUTH_AUTHORITY;
  const audience = process.env.AUTH_AUDIENCE;

  let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
  if (authority && audience) {
    const jwksUri = `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
    JWKS = createRemoteJWKSet(new URL(jwksUri));
  }

  const verifyAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!JWKS || !authority || !audience) {
      return reply.code(500).send({ error: "Auth not configured" });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Missing or invalid authorization header",
        statusCode: 401,
      });
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: authority.replace(/\/$/, "") + "/",
        audience,
      });

      const jwtPayload = payload as unknown as JWTPayload;
      request.user = {
        id: jwtPayload.sub,
        email: jwtPayload.email,
        name: jwtPayload.name,
        picture: jwtPayload.picture,
        emailVerified: jwtPayload.email_verified,
        raw: jwtPayload,
      };
    } catch (error) {
      fastify.log.warn({ error }, "JWT validation failed");
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid token",
        statusCode: 401,
      });
    }
  };

  // List guests for a venue
  fastify.get<{
    Querystring: { venueId: string; page?: string; limit?: string };
    Reply: PaginatedResponse<Guest> | ApiError;
  }>(
    "/",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "List guests for a venue",
        operationId: "listGuests",
        description: "Retrieve a paginated list of guests for a specific venue. Requires authentication.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: {
              type: "string",
              description: "Venue ID to list guests for",
            },
            page: {
              type: "string",
              default: "1",
              description: "Page number (1-indexed)",
            },
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
              data: {
                type: "array",
                items: { $ref: "Guest#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.query;
      if (!venueId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "venueId is required",
          statusCode: 400,
        });
      }
      const page = parseInt(request.query.page ?? "1", 10);
      const limit = Math.min(parseInt(request.query.limit ?? "20", 10), 100);
      return guestService.list(venueId, page, limit);
    }
  );

  // Search guests
  fastify.get<{
    Querystring: {
      venueId: string;
      query?: string;
      tags?: string;
      hasNotVisitedInDays?: string;
    };
    Reply: PaginatedResponse<Guest> | ApiError;
  }>(
    "/search",
    {
      preHandler: verifyAuth,
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
            venueId: {
              type: "string",
              description: "Venue ID to search within",
            },
            query: {
              type: "string",
              description: "Search term (matches name, email, or phone)",
            },
            tags: {
              type: "string",
              description: "Comma-separated tags to filter by",
            },
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
              data: {
                type: "array",
                items: { $ref: "Guest#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const { venueId, query, tags, hasNotVisitedInDays } = request.query;
      if (!venueId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "venueId is required",
          statusCode: 400,
        });
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
      preHandler: verifyAuth,
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
            venueId: {
              type: "string",
              description: "Venue ID to get segments for",
            },
          },
        },
        response: {
          200: {
            description: "Guest segments",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "GuestSegment#" },
              },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.query;
      if (!venueId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "venueId is required",
          statusCode: 400,
        });
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
      preHandler: verifyAuth,
      schema: {
        summary: "Get guest by ID",
        operationId: "getGuestById",
        description: "Retrieve a single guest by ID.",
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
        response: {
          200: {
            description: "Guest found",
            type: "object",
            properties: {
              data: { $ref: "Guest#" },
            },
          },
          404: {
            description: "Guest not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const guest = await guestService.getById(request.params.id);
      if (!guest) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Guest not found",
          statusCode: 404,
        });
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
      preHandler: verifyAuth,
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
            venueId: {
              type: "string",
              description: "Venue ID",
            },
            email: {
              type: "string",
              format: "email",
              description: "Guest email",
            },
            phone: {
              type: "string",
              description: "Guest phone",
            },
            name: {
              type: "string",
              description: "Guest name",
            },
            notes: {
              type: "string",
              description: "Internal notes",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
          },
        },
        response: {
          201: {
            description: "Guest created",
            type: "object",
            properties: {
              data: { $ref: "Guest#" },
            },
          },
          400: {
            description: "Invalid request or duplicate email/phone",
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
        const guest = await guestService.create(request.body);
        return reply.code(201).send({ data: guest });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "A guest with this email or phone already exists at this venue",
            statusCode: 400,
          });
        }
        throw error;
      }
    }
  );

  // Find or create guest (identity resolution)
  fastify.post<{
    Body: { venueId: string; email?: string; phone?: string; name: string };
    Reply: ApiResponse<Guest> | ApiError;
  }>(
    "/find-or-create",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Find or create guest",
        operationId: "findOrCreateGuest",
        description: "Find existing guest by email/phone or create new one. Used for identity resolution when booking.",
        tags: ["Guests"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["venueId", "name"],
          properties: {
            venueId: {
              type: "string",
              description: "Venue ID",
            },
            email: {
              type: "string",
              format: "email",
              description: "Guest email (used for matching)",
            },
            phone: {
              type: "string",
              description: "Guest phone (used for matching if email not found)",
            },
            name: {
              type: "string",
              description: "Guest name",
            },
          },
        },
        response: {
          200: {
            description: "Guest found or created",
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
        },
      },
    },
    async (request, reply) => {
      const { venueId, email, phone, name } = request.body;
      if (!email && !phone) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Either email or phone is required",
          statusCode: 400,
        });
      }
      const guest = await guestService.findOrCreate(venueId, { email, phone, name });
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
      preHandler: verifyAuth,
      schema: {
        summary: "Update a guest",
        operationId: "updateGuest",
        description: "Update guest information. Requires authentication.",
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
          properties: {
            email: { type: "string", format: "email", nullable: true },
            phone: { type: "string", nullable: true },
            name: { type: "string" },
            notes: { type: "string", nullable: true },
            tags: {
              type: "array",
              items: { type: "string" },
              nullable: true,
            },
          },
        },
        response: {
          200: {
            description: "Guest updated",
            type: "object",
            properties: {
              data: { $ref: "Guest#" },
            },
          },
          404: {
            description: "Guest not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const guest = await guestService.update(request.params.id, request.body);
      if (!guest) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Guest not found",
          statusCode: 404,
        });
      }
      return { data: guest };
    }
  );

  // Delete guest
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Delete a guest",
        operationId: "deleteGuest",
        description: "Delete a guest. Will fail if guest has reservations.",
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
        response: {
          204: {
            description: "Guest deleted",
            type: "null",
          },
          404: {
            description: "Guest not found",
            $ref: "Error#",
          },
          409: {
            description: "Guest has reservations",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const deleted = await guestService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Guest not found",
          statusCode: 404,
        });
      }
      return reply.code(204).send();
    }
  );
};
