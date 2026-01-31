import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type {
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import type { AuthUser, JWTPayload } from "@mbe/auth/types";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { reservationService } from "../services/reservation.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const reservationRoutes: FastifyPluginAsync = async (fastify) => {
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

  const optionalAuth = async (request: FastifyRequest) => {
    if (!JWKS || !authority || !audience) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return;
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
    } catch {
      // Invalid token for optional auth - just ignore
    }
  };

  // List reservations
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      date?: string;
      status?: ReservationStatus;
      tableId?: string;
      venueId?: string;
    };
    Reply: PaginatedResponse<Reservation>;
  }>(
    "/",
    {
      schema: {
        summary: "List reservations",
        operationId: "listReservations",
        description:
          "Retrieve a paginated list of reservations. Can filter by date, status, table, or venue.",
        tags: ["Reservations"],
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
              description: "Number of reservations per page (max 100)",
            },
            date: {
              type: "string",
              format: "date",
              description: "Filter by reservation date (YYYY-MM-DD)",
            },
            status: {
              type: "string",
              enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
              description: "Filter by reservation status",
            },
            tableId: {
              type: "string",
              description: "Filter by table ID",
            },
            venueId: {
              type: "string",
              description: "Filter by venue ID",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated reservation list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "Reservation#" },
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
      const page = parseInt(request.query.page ?? "1", 10);
      const limit = parseInt(request.query.limit ?? "10", 10);
      return reservationService.list({
        page,
        limit,
        date: request.query.date,
        status: request.query.status,
        tableId: request.query.tableId,
        venueId: request.query.venueId,
      });
    }
  );

  // Get current user's reservations (must come before /:id)
  fastify.get<{
    Querystring: { page?: string; limit?: string };
    Reply: PaginatedResponse<Reservation> | ApiError;
  }>(
    "/me",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Get current user's reservations",
        operationId: "getMyReservations",
        description:
          "Retrieve reservations for the currently authenticated user.",
        tags: ["Reservations"],
        security: [{ bearerAuth: [] }],
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
              description: "Number of reservations per page (max 100)",
            },
          },
        },
        response: {
          200: {
            description: "User's reservations",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "Reservation#" },
              },
              pagination: { $ref: "Pagination#" },
            },
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
      const authUser = request.user;
      if (!authUser) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
          statusCode: 401,
        });
      }

      const page = parseInt(request.query.page ?? "1", 10);
      const limit = parseInt(request.query.limit ?? "10", 10);
      return reservationService.listByUserId(authUser.id, page, limit);
    }
  );

  // Get reservation by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Reservation> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Get reservation by ID",
        operationId: "getReservationById",
        description: "Retrieve a single reservation by its unique identifier.",
        tags: ["Reservations"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique reservation identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Reservation found",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          404: {
            description: "Reservation not found",
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
      const reservation = await reservationService.getById(request.params.id);
      if (!reservation) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Reservation not found",
          statusCode: 404,
        });
      }
      return { data: reservation };
    }
  );

  // Create reservation
  fastify.post<{
    Body: CreateReservationRequest;
    Reply: ApiResponse<Reservation>;
  }>(
    "/",
    {
      preHandler: optionalAuth,
      schema: {
        summary: "Create a new reservation",
        operationId: "createReservation",
        description:
          "Create a new reservation. Authentication is optional - guest info can be provided instead.",
        tags: ["Reservations"],
        body: {
          type: "object",
          description: "Reservation creation payload",
          properties: {
            date: {
              type: "string",
              format: "date",
              description: "Reservation date (YYYY-MM-DD)",
            },
            startTime: {
              type: "string",
              format: "date-time",
              description: "Start time (ISO 8601)",
            },
            endTime: {
              type: "string",
              format: "date-time",
              description: "End time (ISO 8601)",
            },
            partySize: {
              type: "integer",
              minimum: 1,
              description: "Number of guests",
            },
            tableId: {
              type: "string",
              description: "ID of the table to reserve",
            },
            notes: {
              type: "string",
              description: "Special requests or notes",
            },
            guestName: {
              type: "string",
              description: "Guest name (for unauthenticated reservations)",
            },
            guestEmail: {
              type: "string",
              format: "email",
              description: "Guest email (for unauthenticated reservations)",
            },
            guestPhone: {
              type: "string",
              description: "Guest phone number",
            },
            venueId: {
              type: "string",
              description: "ID of the venue for this reservation",
            },
          },
          required: ["date", "startTime", "endTime", "partySize", "tableId"],
        },
        response: {
          201: {
            description: "Reservation created successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          400: {
            description: "Invalid request body",
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
      const userId = request.user?.id;
      const reservation = await reservationService.create(request.body, userId);
      return reply.code(201).send({ data: reservation });
    }
  );

  // Update reservation
  fastify.patch<{
    Params: { id: string };
    Body: UpdateReservationRequest;
    Reply: ApiResponse<Reservation> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Update a reservation",
        operationId: "updateReservation",
        description:
          "Update an existing reservation. Only provided fields will be updated.",
        tags: ["Reservations"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique reservation identifier",
            },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          description: "Fields to update",
          properties: {
            date: {
              type: "string",
              format: "date",
              description: "New reservation date",
            },
            startTime: {
              type: "string",
              format: "date-time",
              description: "New start time",
            },
            endTime: {
              type: "string",
              format: "date-time",
              description: "New end time",
            },
            partySize: {
              type: "integer",
              minimum: 1,
              description: "New party size",
            },
            tableId: {
              type: "string",
              description: "New table ID",
            },
            status: {
              type: "string",
              enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
              description: "New status",
            },
            notes: {
              type: "string",
              description: "Updated notes",
            },
          },
        },
        response: {
          200: {
            description: "Reservation updated successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          404: {
            description: "Reservation not found",
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
      const reservation = await reservationService.update(
        request.params.id,
        request.body
      );
      if (!reservation) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Reservation not found",
          statusCode: 404,
        });
      }
      return { data: reservation };
    }
  );

  // Cancel reservation (DELETE)
  fastify.delete<{
    Params: { id: string };
    Reply: ApiResponse<Reservation> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Cancel a reservation",
        operationId: "cancelReservation",
        description:
          "Cancel a reservation. The reservation is marked as cancelled but not deleted.",
        tags: ["Reservations"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique reservation identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Reservation cancelled successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          404: {
            description: "Reservation not found",
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
      const reservation = await reservationService.cancel(request.params.id);
      if (!reservation) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Reservation not found",
          statusCode: 404,
        });
      }
      return { data: reservation };
    }
  );
};
