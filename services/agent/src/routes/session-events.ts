import type { FastifyPluginAsync } from "fastify";
import { type ApiError, createProblemDetails } from "@mbe/types";
import { sessionService } from "../services/session.js";

const SSE_POLL_INTERVAL_MS = 1000;

export const sessionEventsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/sessions/:id/events — SSE stream of session events
  fastify.get<{
    Params: { id: string };
    Reply: void | ApiError;
  }>(
    "/:id/events",
    {
      schema: {
        summary: "Stream session events (SSE)",
        operationId: "streamSessionEvents",
        description:
          "Server-Sent Events stream for real-time session updates. " +
          "Sends existing events immediately, then polls for new events until the session completes.",
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

      let lastEventId: string | undefined;
      let isOpen = true;

      request.raw.on("close", () => {
        isOpen = false;
      });

      const sendEvent = (type: string, data: unknown) => {
        if (!isOpen) return;
        reply.raw.write(`event: ${type}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send existing events first
      const existingEvents = await sessionService.listEvents(session.id);
      for (const event of existingEvents) {
        sendEvent(event.type, event);
        lastEventId = event.id;
      }

      // If session is already terminal, close the stream
      const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
      if (terminalStatuses.has(session.status)) {
        sendEvent("stream:end", { reason: "session_complete" });
        reply.raw.end();
        return;
      }

      // Poll for new events until session completes
      const poll = async () => {
        while (isOpen) {
          await new Promise((resolve) => setTimeout(resolve, SSE_POLL_INTERVAL_MS));

          if (!isOpen) break;

          const newEvents = await sessionService.listEvents(session.id, lastEventId);
          for (const event of newEvents) {
            sendEvent(event.type, event);
            lastEventId = event.id;
          }

          // Check if session has completed
          const current = await sessionService.getById(session.id);
          if (current && terminalStatuses.has(current.status)) {
            sendEvent("stream:end", { reason: "session_complete", status: current.status });
            break;
          }
        }

        reply.raw.end();
      };

      poll().catch((err) => {
        fastify.log.error({ sessionId: session.id, err }, "SSE polling error");
        if (isOpen) {
          sendEvent("stream:error", { message: "Internal polling error" });
          reply.raw.end();
        }
      });
    }
  );
};
