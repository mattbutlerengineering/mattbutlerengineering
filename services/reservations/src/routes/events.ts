import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails } from "@mbe/types";
import type { ReservationEvent } from "../services/events.js";
import {
  SseConnectionManager,
  type SseConnectionConfig,
} from "../services/sse-connection-manager.js";

/** Per-connection event buffer that drops oldest events when full. */
class EventBuffer {
  private readonly maxSize: number;
  private buffer: readonly ReservationEvent[] = [];
  private _droppedCount = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /** Push an event, dropping the oldest if the buffer is full. Returns true if an event was dropped. */
  push(event: ReservationEvent): boolean {
    if (this.buffer.length >= this.maxSize) {
      // Drop oldest, append new — immutable replacement
      this.buffer = [...this.buffer.slice(1), event];
      this._droppedCount += 1;
      return true;
    }
    this.buffer = [...this.buffer, event];
    return false;
  }

  /** Drain all buffered events, resetting the buffer. */
  drain(): readonly ReservationEvent[] {
    const events = this.buffer;
    this.buffer = [];
    return events;
  }

  get length(): number {
    return this.buffer.length;
  }

  get droppedCount(): number {
    return this._droppedCount;
  }
}

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
      const config = connectionManager.getConfig();

      // --- Guard: max connections per IP ---
      const result = connectionManager.register(clientIp);
      if (!result.allowed) {
        request.log.warn(
          { ip: clientIp, reason: result.reason },
          "SSE connection rejected: per-IP limit reached"
        );
        return reply
          .code(429)
          .send(createProblemDetails(429, "Too Many Connections", result.reason));
      }

      const connectionId = result.connection.id;

      // Event buffer to cap memory per connection
      const eventBuffer = new EventBuffer(config.maxEventBufferSize);

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send initial connection event
      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ message: "Connected to event stream" })}\n\n`
      );

      // --- Heartbeat: keep-alive ping ---
      const pingInterval = setInterval(() => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(`: ping\n\n`);
        }
      }, config.heartbeatIntervalMs);

      // --- Connection timeout: close idle connections after max lifetime ---
      const timeoutTimer = setTimeout(() => {
        if (!reply.raw.writableEnded) {
          request.log.info(
            { connectionId, ip: clientIp, lifetimeMs: config.connectionTimeoutMs },
            "SSE connection closed: max lifetime reached"
          );
          reply.raw.write(
            `event: timeout\ndata: ${JSON.stringify({ message: "Connection timeout — please reconnect" })}\n\n`
          );
          reply.raw.end();
        }
      }, config.connectionTimeoutMs);

      // Event handler with buffer protection
      const handleEvent = (event: ReservationEvent) => {
        // Filter by venueId if specified
        if (venueId && event.venueId !== venueId) {
          return;
        }

        // Check if stream is still writable
        if (reply.raw.writableEnded) {
          return;
        }

        // Buffer the event (drops oldest if over limit)
        const dropped = eventBuffer.push(event);
        if (dropped && eventBuffer.droppedCount % 10 === 0) {
          request.log.warn(
            { connectionId, ip: clientIp, droppedTotal: eventBuffer.droppedCount },
            "SSE event buffer overflow — dropping oldest events"
          );
        }

        // Drain and send all buffered events
        const events = eventBuffer.drain();
        for (const bufferedEvent of events) {
          reply.raw.write(
            `event: ${bufferedEvent.type}\ndata: ${JSON.stringify(bufferedEvent)}\n\n`
          );
        }
      };

      // Subscribe to events
      fastify.reservationEvents.onChange(handleEvent);
      fastify.log.info(
        { connectionId, ip: clientIp, connections: fastify.reservationEvents.getConnectionCount() },
        "SSE client connected"
      );

      // Cleanup on disconnect
      const cleanup = () => {
        clearInterval(pingInterval);
        clearTimeout(timeoutTimer);
        fastify.reservationEvents.offChange(handleEvent);
        connectionManager.unregister(connectionId);
        fastify.log.info(
          {
            connectionId,
            ip: clientIp,
            connections: fastify.reservationEvents.getConnectionCount(),
          },
          "SSE client disconnected"
        );
      };

      request.raw.on("close", cleanup);

      // Don't end the response - keep the connection open
      // The response will be ended when the client disconnects or timeout fires

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
