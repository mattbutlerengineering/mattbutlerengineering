import type { FastifyPluginAsync } from "fastify";
import type {
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
  WalkInRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import { requireAuth, optionalAuth } from "@mbe/auth/fastify";
import { reservationService } from "../services/reservation.js";
import { emitReservationCancelled, emitReservationCreated, emitTableUpdated } from "../services/events.js";
import { tableService } from "../services/table.js";

export const reservationRoutes: FastifyPluginAsync = async (fastify) => {
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
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
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
      preHandler: requireAuth,
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

      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
      return reservationService.listByUserId(authUser.id, page, limit);
    }
  );

  // Create walk-in reservation (must be before /:id)
  fastify.post<{
    Body: WalkInRequest;
    Reply: ApiResponse<Reservation> | ApiError;
  }>(
    "/walk-in",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create a walk-in reservation",
        operationId: "createWalkIn",
        description:
          "Create an immediate walk-in reservation. Sets the reservation to CONFIRMED status and marks the table as OCCUPIED. Requires authentication.",
        tags: ["Reservations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Walk-in reservation payload",
          properties: {
            partySize: {
              type: "integer",
              minimum: 1,
              description: "Number of guests",
            },
            tableId: {
              type: "string",
              description: "ID of the table to seat guests at",
            },
            venueId: {
              type: "string",
              description: "ID of the venue",
            },
            guestName: {
              type: "string",
              description: "Guest name (defaults to 'Walk-in')",
            },
            durationMinutes: {
              type: "integer",
              minimum: 1,
              description: "Expected duration in minutes (defaults to 90)",
            },
          },
          required: ["partySize", "tableId", "venueId"],
        },
        response: {
          201: {
            description: "Walk-in reservation created successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          409: {
            description: "Table is not available",
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
      const result = await reservationService.createWalkIn(request.body, userId);
      if (!result.success || !result.reservation) {
        return reply.code(409).send({
          error: "Conflict",
          message: result.error ?? "Table is not available",
          statusCode: 409,
        });
      }
      const updatedTable = await tableService.updateStatus(request.body.tableId, "OCCUPIED");
      emitReservationCreated(result.reservation);
      if (updatedTable) {
        emitTableUpdated(updatedTable);
      }
      return reply.code(201).send({ data: result.reservation });
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
    Reply: ApiResponse<Reservation> | ApiError;
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
            description: "Invalid request body or pacing limit exceeded",
            $ref: "Error#",
          },
          409: {
            description: "Conflict with existing reservation or hold",
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
      const result = await reservationService.createWithConflictCheck(
        request.body,
        userId
      );

      if (!result.success) {
        const statusCode = result.conflict?.hasConflict ? 409 : 400;
        return reply.code(statusCode).send({
          error: statusCode === 409 ? "Conflict" : "Bad Request",
          message: result.error ?? "Failed to create reservation",
          statusCode,
        });
      }

      return reply.code(201).send({ data: result.reservation! });
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
            cancellationReason: {
              type: "string",
              description: "Reason for cancellation (used when status is CANCELLED)",
            },
            cancellationNote: {
              type: "string",
              description: "Additional cancellation notes (used when status is CANCELLED)",
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
          400: {
            description: "Invalid request",
            $ref: "Error#",
          },
          404: {
            description: "Reservation not found",
            $ref: "Error#",
          },
          409: {
            description: "Conflict with existing reservation or hold",
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
      if (request.body.status === "CANCELLED") {
        const reservation = await reservationService.cancel(
          request.params.id,
          request.body.cancellationReason,
          request.body.cancellationNote
        );

        if (!reservation) {
          return reply.code(404).send({
            error: "Not Found",
            message: "Reservation not found",
            statusCode: 404,
          });
        }

        emitReservationCancelled(reservation);
        return { data: reservation };
      }

      const result = await reservationService.updateWithConflictCheck(
        request.params.id,
        request.body
      );

      if (!result.success) {
        if (result.error === "Reservation not found") {
          return reply.code(404).send({
            error: "Not Found",
            message: "Reservation not found",
            statusCode: 404,
          });
        }

        if (result.conflict?.hasConflict) {
          return reply.code(409).send({
            error: "Conflict",
            message: result.error ?? "Time slot has a conflict",
            statusCode: 409,
          });
        }

        return reply.code(400).send({
          error: "Bad Request",
          message: result.error ?? "Failed to update reservation",
          statusCode: 400,
        });
      }

      return { data: result.reservation! };
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
