import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type {
  ReservationHold,
  Reservation,
  CreateHoldRequest,
  ConfirmHoldRequest,
  ApiResponse,
  ProblemDetails,
} from "@mbe/types";
import {
  createProblemDetails,
  createHoldBodyJsonSchema,
  confirmHoldBodyJsonSchema,
} from "@mbe/types";
import { randomUUID } from "crypto";
import { requireAuth } from "@mbe/auth/fastify";
import { holdService } from "../services/hold.js";
import { confirmHold } from "../services/confirm-hold.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { generateManageToken } from "./public-reservations.js";

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

/**
 * Authenticated (staff) hold routes, mounted under the api/v1 holds prefix.
 *
 * Every route here requires a JWT (#4487). This service's contract is that all
 * api/v1 routes require auth except availability, but these four were exempt in
 * practice because the anonymous public booking widget called them. The widget
 * now uses the hardened public sibling (`public-holds.ts`,
 * `/public/v1/venues/:slug/holds`), which resolves the venue by slug
 * server-side instead of trusting a client-supplied `venueId` and applies a
 * per-IP active-hold cap. This file stays as the staff surface.
 */
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
    Reply: ApiResponse<ReservationHold> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
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
              description: "Session identifier. If not provided, one will be generated.",
            },
          },
        },
        body: createHoldBodyJsonSchema,
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
        const title = statusCode === 404 ? "Not Found" : "Conflict";
        return reply
          .code(statusCode)
          .send(createProblemDetails(statusCode, title, result.error ?? "Failed to create hold"));
      }

      // Set the session ID header in response
      reply.header(SESSION_ID_HEADER, sessionId);
      return reply.code(201).send({ data: result.hold! });
    }
  );

  // GET /:id - Get hold status
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<ReservationHold> | ProblemDetails;
  }>(
    "/:id",
    {
      // Issue #4487: the per-IP cap runs BEFORE requireAuth so anonymous
      // 401-probing is bounded too, as a preHandler ON TOP of the service-wide
      // 100/min onRequest limiter. Deliberately NOT a route-level
      // config.rateLimit — that would replace the global limiter and (#4492)
      // leave stages before the preHandler with no bound at all.
      preHandler: [publicRateLimitHook, requireAuth],
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
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Hold not found or expired"));
      }

      return { data: hold };
    }
  );

  // DELETE /:id - Release a hold
  fastify.delete<{
    Params: { id: string };
    Reply: { success: boolean } | ProblemDetails;
  }>(
    "/:id",
    {
      // See the GET /:id comment — per-IP cap, then auth, on top of the global limiter.
      preHandler: [publicRateLimitHook, requireAuth],
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
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", `Missing ${SESSION_ID_HEADER} header`));
      }

      const released = await holdService.release(request.params.id, sessionId);

      if (!released) {
        return reply
          .code(404)
          .send(
            createProblemDetails(404, "Not Found", "Hold not found or not owned by this session")
          );
      }

      return { success: true };
    }
  );

  // POST /:id/confirm - Convert hold to reservation
  fastify.post<{
    Params: { id: string };
    Body: ConfirmHoldRequest;
    Reply: (ApiResponse<Reservation> & { manageToken?: string }) | ProblemDetails;
  }>(
    "/:id/confirm",
    {
      // See the GET /:id comment — per-IP cap, then auth, on top of the global limiter.
      preHandler: [publicRateLimitHook, requireAuth],
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
        body: confirmHoldBodyJsonSchema,
        response: {
          201: {
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
              manageToken: {
                type: "string",
                description: "Self-service token for managing/cancelling this reservation",
              },
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
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", `Missing ${SESSION_ID_HEADER} header`));
      }

      const result = await confirmHold({
        holdId: request.params.id,
        sessionId,
        guestDetails: request.body,
      });

      if (!result.success) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          EXPIRED: 410,
          SESSION_MISMATCH: 403,
          CONFLICT: 409,
          PACING_EXCEEDED: 422,
        };
        const titleMap: Record<string, string> = {
          NOT_FOUND: "Not Found",
          EXPIRED: "Hold Expired",
          SESSION_MISMATCH: "Forbidden",
          CONFLICT: "Conflict",
          PACING_EXCEEDED: "Pacing Limit Reached",
        };
        const statusCode = statusMap[result.errorCode] ?? 409;
        const title = titleMap[result.errorCode] ?? "Conflict";

        return reply.code(statusCode).send(createProblemDetails(statusCode, title, result.error));
      }

      // Self-service manage/cancel token, threaded through so the guest-facing
      // confirmation screen can link straight to the manage page (#4978) —
      // reuses the same signing logic as the authenticated-email path in
      // public-reservations.ts rather than duplicating it. Only mint one when
      // guestEmail was actually provided: confirm-hold.ts stores a missing
      // email as `null`, and requireManageToken checks the token's signed
      // email against that stored value with strict equality — signing with
      // "" instead of omitting the token would produce a manage link that
      // can never validate for a phone-only booking.
      const manageToken = request.body.guestEmail
        ? generateManageToken(result.reservation.id, request.body.guestEmail)
        : undefined;

      return reply.code(201).send({ data: result.reservation, manageToken });
    }
  );
};
