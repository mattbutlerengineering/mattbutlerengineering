import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createProblemDetails,
  eventsStreamQueryJsonSchema,
  testEventBodyJsonSchema,
  deriveTableDisplayStatus,
  type Reservation,
  type TableStatusDelta,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
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

/**
 * Domain event types whose `data` is a `Reservation` representing a
 * reservation/hold transition that can flip a table's derived display
 * status (see `deriveTableDisplayStatus` in @mbe/types).
 */
const RESERVATION_TRANSITION_EVENT_TYPES: ReadonlySet<ReservationEvent["type"]> = new Set([
  "reservation:created",
  "reservation:updated",
  "reservation:cancelled",
  "hold:confirmed",
]);

/**
 * Derive the per-table status delta for a reservation/hold transition
 * event. Returns `[]` for event types this doesn't apply to.
 *
 * `hasActiveHold` (physical seating/occupancy) isn't carried on these
 * events' `Reservation` payload, so it's treated as `false` here. The
 * `table:updated` event (which does carry occupancy via `Table.status`)
 * is a separate signal, wired up when the floor plan canvas consumes
 * this stream (#3834/#3835).
 */
function deriveTableStatusDelta(event: ReservationEvent): TableStatusDelta[] {
  if (!RESERVATION_TRANSITION_EVENT_TYPES.has(event.type)) {
    return [];
  }

  const reservation = event.data as Reservation;
  const status = deriveTableDisplayStatus({
    reservation,
    hasActiveHold: false,
    now: new Date(),
  });

  return [{ tableId: reservation.tableId, status }];
}

export async function eventRoutes(fastify: FastifyInstance): Promise<void> {
  // Re-derive per-table display-status deltas from reservation/hold
  // transitions and re-emit as `table-status:changed` — changed tables
  // only, never a full floor-plan resync (payload-growth risk, proposal
  // #3803). Registered once per app boot via the raw EventEmitter `on`
  // (not the connection-counted `onChange` wrapper) so every connected
  // client's own `handleEvent` below forwards a single, consistent
  // derived event instead of each connection re-deriving independently.
  fastify.reservationEvents.on("change", (event: ReservationEvent) => {
    const changes = deriveTableStatusDelta(event);
    fastify.reservationEvents.emitTableStatusChanged(event.venueId, changes);
  });

  // GET /events/stream - Server-Sent Events stream
  fastify.get<{
    Querystring: { venueId?: string };
  }>(
    "/stream",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Subscribe to real-time reservation events",
        operationId: "streamEvents",
        description:
          "Server-Sent Events (SSE) endpoint for real-time updates. " +
          "Connect to receive live notifications of reservation changes, holds, and table updates. " +
          "Optionally filter by venueId.",
        tags: ["Events"],
        querystring: eventsStreamQueryJsonSchema,
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
          body: testEventBodyJsonSchema,
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
