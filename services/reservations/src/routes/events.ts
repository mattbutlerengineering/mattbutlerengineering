import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { reservationEvents, type ReservationEvent } from "../services/events.js";

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

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send initial connection event
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ message: "Connected to event stream" })}\n\n`);

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        reply.raw.write(`: ping\n\n`);
      }, 30000);

      // Event handler
      const handleEvent = (event: ReservationEvent) => {
        // Filter by venueId if specified
        if (venueId && event.venueId !== venueId) {
          return;
        }

        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // Subscribe to events
      reservationEvents.onChange(handleEvent);
      fastify.log.info(
        { connections: reservationEvents.getConnectionCount() },
        "SSE client connected"
      );

      // Cleanup on disconnect
      request.raw.on("close", () => {
        clearInterval(pingInterval);
        reservationEvents.offChange(handleEvent);
        fastify.log.info(
          { connections: reservationEvents.getConnectionCount() },
          "SSE client disconnected"
        );
      });

      // Don't end the response - keep the connection open
      // The response will be ended when the client disconnects

      // TEST-ONLY: automatically close after N ms to allow app.inject to complete in tests
      if (process.env.NODE_ENV === "test" && testClose) {
        setTimeout(() => {
          if (!reply.raw.writableEnded) {
            reply.raw.end();
          }
        }, parseInt(testClose, 10));
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

        reservationEvents.emitChange({
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
