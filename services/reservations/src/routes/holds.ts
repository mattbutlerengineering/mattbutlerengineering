import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type {
  ReservationHold,
  Reservation,
  CreateHoldRequest,
  ConfirmHoldRequest,
  ApiResponse,
  ApiError,
} from "@mbe/types";
import { randomUUID } from "crypto";
import { holdService } from "../services/hold.js";

// Session ID header name
const SESSION_ID_HEADER = "x-session-id";

// Schema for ReservationHold
const HoldSchema = {
  $id: "ReservationHold",
  type: "object",
  description: "A temporary hold on a reservation slot",
  required: [
    "id",
    "venueId",
    "tableId",
    "date",
    "startTime",
    "endTime",
    "partySize",
    "sessionId",
    "expiresAt",
    "createdAt",
  ],
  properties: {
    id: { type: "string", description: "Unique identifier for the hold" },
    venueId: { type: "string", description: "ID of the venue" },
    tableId: { type: "string", description: "ID of the held table" },
    date: { type: "string", format: "date", description: "Reservation date" },
    startTime: {
      type: "string",
      format: "date-time",
      description: "Start time",
    },
    endTime: { type: "string", format: "date-time", description: "End time" },
    partySize: { type: "integer", description: "Number of guests" },
    sessionId: { type: "string", description: "Session identifier" },
    expiresAt: {
      type: "string",
      format: "date-time",
      description: "When the hold expires",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "When the hold was created",
    },
  },
} as const;

/**
 * Gets or creates a session ID from the request.
 */
function getSessionId(request: FastifyRequest): string {
  const header = request.headers[SESSION_ID_HEADER];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  // Generate a new session ID if not provided
  return randomUUID();
}

export const holdRoutes: FastifyPluginAsync = async (fastify) => {
  // Register schemas
  fastify.addSchema(HoldSchema);

  // Opportunistic cleanup hook
  fastify.addHook("onRequest", async () => {
    // 1% chance to cleanup expired holds
    await holdService.maybeCleanup();
  });

  // POST / - Create a hold
  fastify.post<{
    Body: CreateHoldRequest;
    Reply: ApiResponse<ReservationHold> | ApiError;
  }>(
    "/",
    {
      schema: {
        summary: "Create a reservation hold",
        operationId: "createHold",
        description:
          "Create a temporary hold on a time slot. The hold expires after 10 minutes (configurable per venue). " +
          "Pass a session ID via the x-session-id header to track your holds.",
        tags: ["Holds"],
        headers: {
          type: "object",
          properties: {
            [SESSION_ID_HEADER]: {
              type: "string",
              description:
                "Session identifier. If not provided, one will be generated.",
            },
          },
        },
        body: {
          type: "object",
          required: ["venueId", "date", "time", "partySize"],
          properties: {
            venueId: { type: "string", description: "Venue ID" },
            date: {
              type: "string",
              format: "date",
              description: "Reservation date (YYYY-MM-DD)",
            },
            time: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO 8601 format",
            },
            partySize: { type: "integer", minimum: 1, description: "Number of guests" },
            tableId: {
              type: "string",
              description: "Optional specific table to hold. If not provided, best available table is assigned.",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              data: { $ref: "ReservationHold#" },
            },
          },
          400: { $ref: "Error#" },
          409: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const sessionId = getSessionId(request);
      const result = await holdService.create(request.body, sessionId);

      if (!result.success) {
        const statusCode = result.error?.includes("not found") ? 404 : 409;
        return reply.code(statusCode).send({
          error: statusCode === 404 ? "Not Found" : "Conflict",
          message: result.error ?? "Failed to create hold",
          statusCode,
        });
      }

      // Set the session ID header in response
      reply.header(SESSION_ID_HEADER, sessionId);
      return reply.code(201).send({ data: result.hold! });
    }
  );

  // GET /:id - Get hold status
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<ReservationHold> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Get hold status",
        operationId: "getHold",
        description: "Get the status of a reservation hold. Returns 404 if the hold has expired.",
        tags: ["Holds"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Hold ID" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { $ref: "ReservationHold#" },
            },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const hold = await holdService.getById(request.params.id);

      if (!hold) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Hold not found or expired",
          statusCode: 404,
        });
      }

      return { data: hold };
    }
  );

  // DELETE /:id - Release a hold
  fastify.delete<{
    Params: { id: string };
    Reply: { success: boolean } | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Release a hold",
        operationId: "releaseHold",
        description:
          "Release a reservation hold. Requires the same session ID that created the hold.",
        tags: ["Holds"],
        headers: {
          type: "object",
          required: [SESSION_ID_HEADER],
          properties: {
            [SESSION_ID_HEADER]: {
              type: "string",
              description: "Session identifier used when creating the hold",
            },
          },
        },
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Hold ID" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
            },
          },
          401: { $ref: "Error#" },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.headers[SESSION_ID_HEADER];

      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: `Missing ${SESSION_ID_HEADER} header`,
          statusCode: 401,
        });
      }

      const released = await holdService.release(request.params.id, sessionId);

      if (!released) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Hold not found or not owned by this session",
          statusCode: 404,
        });
      }

      return { success: true };
    }
  );

  // POST /:id/confirm - Convert hold to reservation
  fastify.post<{
    Params: { id: string };
    Body: ConfirmHoldRequest;
    Reply: ApiResponse<Reservation> | ApiError;
  }>(
    "/:id/confirm",
    {
      schema: {
        summary: "Confirm a hold and create reservation",
        operationId: "confirmHold",
        description:
          "Convert a hold into a confirmed reservation. Requires the same session ID that created the hold. " +
          "At least one of guestName, guestEmail, or guestPhone should be provided.",
        tags: ["Holds"],
        headers: {
          type: "object",
          required: [SESSION_ID_HEADER],
          properties: {
            [SESSION_ID_HEADER]: {
              type: "string",
              description: "Session identifier used when creating the hold",
            },
          },
        },
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Hold ID" },
          },
        },
        body: {
          type: "object",
          properties: {
            guestName: { type: "string", description: "Guest name" },
            guestEmail: {
              type: "string",
              format: "email",
              description: "Guest email",
            },
            guestPhone: { type: "string", description: "Guest phone number" },
            guestId: {
              type: "string",
              description: "ID of existing guest record",
            },
            notes: {
              type: "string",
              description: "Special requests or notes",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          400: { $ref: "Error#" },
          401: { $ref: "Error#" },
          404: { $ref: "Error#" },
          409: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.headers[SESSION_ID_HEADER];

      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: `Missing ${SESSION_ID_HEADER} header`,
          statusCode: 401,
        });
      }

      const result = await holdService.convertToReservation(
        request.params.id,
        sessionId,
        request.body
      );

      if (!result.success) {
        const isNotFound =
          result.error?.includes("not found") ||
          result.error?.includes("expired");
        const statusCode = isNotFound ? 404 : 409;

        return reply.code(statusCode).send({
          error: isNotFound ? "Not Found" : "Conflict",
          message: result.error ?? "Failed to confirm hold",
          statusCode,
        });
      }

      return reply.code(201).send({ data: result.reservation! });
    }
  );
};
