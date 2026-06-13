import type { FastifyPluginAsync } from "fastify";
import { type ApiError, type AgentSessionEvent, createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { sessionService } from "../services/session.js";
import { getSessionEventEmitter } from "../services/session-event-emitter.js";

/**
 * Event types that signal the session has reached a terminal state. When one of
 * these is delivered, the SSE stream closes — no per-tick DB status poll needed.
 */
const TERMINAL_EVENT_TYPES = new Set(["session:complete", "session:error", "session:cancelled"]);

/** Session statuses that are terminal on connect (replay-only, no live stream). */
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export const sessionEventsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/sessions/:id/events — SSE stream of session events
  fastify.get<{
    Params: { id: string };
    Reply: void | ApiError;
  }>(
    "/:id/events",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "Stream session events (SSE)",
        operationId: "streamSessionEvents",
        description:
          "Server-Sent Events stream for real-time session updates. " +
          "Replays existing events from the database on connect, then streams " +
          "new events live via an in-process subscription until the session completes.",
        tags: ["Events"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            description: "SSE event stream",
            type: "string",
          },
          404: { $ref: "AgentError#" },
        },
      },
    },
    async (request, reply) => {
      const session = await sessionService.getById(request.params.id);
      if (!session) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Session not found"));
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let isOpen = true;
      const sentEventIds = new Set<string>();

      const sendEvent = (type: string, data: unknown) => {
        if (!isOpen) return;
        reply.raw.write(`event: ${type}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const closeStream = (reason: string, status?: string) => {
        if (!isOpen) return;
        sendEvent("stream:end", status ? { reason, status } : { reason });
        isOpen = false;
        reply.raw.end();
      };

      const deliver = (event: AgentSessionEvent) => {
        if (!isOpen || sentEventIds.has(event.id)) return;
        sentEventIds.add(event.id);
        sendEvent(event.type, event);
        if (TERMINAL_EVENT_TYPES.has(event.type)) {
          closeStream("session_complete", session.status);
        }
      };

      // Subscribe before the catch-up read so events added during catch-up are
      // buffered, not lost. Buffered events flush (deduped by id) after replay.
      const liveBuffer: AgentSessionEvent[] = [];
      let replayed = false;
      let unsubscribe: () => void = () => {};
      unsubscribe = getSessionEventEmitter().subscribe(session.id, (event) => {
        if (replayed) {
          deliver(event);
        } else {
          liveBuffer.push(event);
        }
      });

      request.raw.on("close", () => {
        isOpen = false;
        unsubscribe();
      });

      try {
        // Catch-up: read persisted events once on connect (the only DB event read).
        const existingEvents = await sessionService.listEvents(session.id);
        for (const event of existingEvents) {
          deliver(event);
        }

        // Flush anything that arrived live during catch-up, then go fully live.
        replayed = true;
        for (const event of liveBuffer) {
          deliver(event);
        }

        // If the session was already terminal on connect, close after replay.
        if (isOpen && TERMINAL_STATUSES.has(session.status)) {
          closeStream("session_complete", session.status);
        }
      } catch (err) {
        fastify.log.error({ sessionId: session.id, err }, "SSE catch-up error");
        if (isOpen) {
          sendEvent("stream:error", { message: "Internal stream error" });
          isOpen = false;
          reply.raw.end();
        }
        unsubscribe();
      }

      if (!isOpen) {
        unsubscribe();
      }
    }
  );
};
