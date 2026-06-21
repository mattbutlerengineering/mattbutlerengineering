import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails } from "@mbe/types";
import type { ReservationEvent } from "../services/events.js";
import {
  SseConnectionManager,
  type SseConnectionConfig,
} from "../services/sse-connection-manager.js";

/** Shared connection manager — one per process. */
const connectionManager = new SseConnectionManager();

/**
 * Override SSE config for tests without mutating the default singleton.
 * Returns the manager instance so tests can inspect state.
 */
export function getConnectionManager(): SseConnectionManager {
  return connectionManager;
}

/**
 * Create a connection manager with custom config (for testing).
 */
export function createConnectionManager(
  config?: Partial<SseConnectionConfig>
): SseConnectionManager {
  return new SseConnectionManager(config);
}

export async function eventRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /events/stream - Server-Sent Events stream
  fastify.get<{
    Querystring: { venueId?: string };
  }>(
    "/stream",
    {
      schema: {
        summary: "Subscribe to real-time reservation events",
        operationId: "streamEvents",
        description:
          "Server-Sent Events (SSE) endpoint for real-time updates. " +
          "Connect to receive live notifications of reservation changes, holds, and table updates. " +
          "Optionally filter by venueId.",
        tags: ["Events"],
        querystring: {
          type: "object",
          properties: {
            venueId: {
              type: "string",
              description: "Filter events to a specific venue",
            },
          },
        },
        response: {
          200: {
            description: "SSE stream established",
            type: "string",
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { venueId?: string; testClose?: string } }>,
      reply: FastifyReply
    ) => {
      const { venueId, testClose } = request.query;
      const clientIp = request.ip;

      // --- Guard: max connections per IP ---
      const result = connectionManager.accept(request, reply);
      if (!result.ok) {
        request.log.warn(
          { ip: clientIp, reason: result.reason },
          "SSE connection rejected: per-IP limit reached"
        );
        return reply
          .code(429)
          .send(createProblemDetails(429, "Too Many Connections", result.reason));
      }

      const { connection } = result;

      // Domain event handler — filter by venueId, write to connection
      const handleEvent = (event: ReservationEvent) => {
        if (venueId && event.venueId !== venueId) return;
        connection.write(event);
      };

      // Subscribe to domain events
      fastify.reservationEvents.onChange(handleEvent);
      fastify.log.info(
        {
          connectionId: connection.id,
          ip: clientIp,
          connections: fastify.reservationEvents.getConnectionCount(),
        },
        "SSE client connected"
      );

      // Unsubscribe and log on disconnect
      request.raw.on("close", () => {
        fastify.reservationEvents.offChange(handleEvent);
        fastify.log.info(
          {
            connectionId: connection.id,
            ip: clientIp,
            connections: fastify.reservationEvents.getConnectionCount(),
          },
          "SSE client disconnected"
        );
      });

      // TEST-ONLY: automatically close after a fixed delay to allow app.inject to complete.
      // The testClose param is a boolean flag — its value is ignored to prevent
      // user-controlled data from flowing into setTimeout (CodeQL js/resource-exhaustion).
      if (process.env.NODE_ENV === "test" && testClose) {
        const TEST_CLOSE_TIMEOUT_MS = 50;
        setTimeout(() => {
          if (!reply.raw.writableEnded) {
            reply.raw.end();
          }
        }, TEST_CLOSE_TIMEOUT_MS);
      }
    }
  );

  // GET /events/test - Test endpoint to trigger an event (development only)
  if (process.env.NODE_ENV !== "production") {
    fastify.post<{
      Body: { type: string; venueId: string; data: unknown };
    }>(
      "/test",
      {
        schema: {
          summary: "Trigger a test event (development only)",
          operationId: "testEvent",
          tags: ["Events"],
          body: {
            type: "object",
            required: ["type", "venueId", "data"],
            properties: {
              type: { type: "string" },
              venueId: { type: "string" },
              data: { type: "object" },
            },
          },
        },
      },
      async (request, reply) => {
        const { type, venueId, data } = request.body;

        fastify.reservationEvents.emitChange({
          type: type as ReservationEvent["type"],
          venueId,
          timestamp: new Date().toISOString(),
          data: data as ReservationEvent["data"],
        });

        return reply.send({ success: true, message: "Event emitted" });
      }
    );
  }
}
