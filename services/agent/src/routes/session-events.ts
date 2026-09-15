import type { FastifyPluginAsync } from "fastify";
import { type ProblemDetails, type AgentSessionEvent, createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { sessionService, EVENTS_PAGE_SIZE } from "../services/session.js";
import { getSessionEventEmitter } from "../services/session-event-emitter.js";
import { requireSessionAccess } from "./sessions.js";

/**
 * Event types that signal the session has reached a terminal state. When one of
 * these is delivered, the SSE stream closes — no per-tick DB status poll needed.
 */
const TERMINAL_EVENT_TYPES = new Set(["session:complete", "session:error", "session:cancelled"]);

/** Session statuses that are terminal on connect (replay-only, no live stream). */
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Upper bound on how many persisted events the SSE catch-up read will drain
 * via the afterId cursor loop (10 pages of EVENTS_PAGE_SIZE). Sessions under
 * this size get their full history replayed. Pathological sessions (tens of
 * thousands of events) would otherwise block connection setup indefinitely,
 * so the loop stops here and emits an explicit `events:truncated` marker
 * instead of either hanging or silently dropping history like the old
 * single-page read did.
 */
const MAX_CATCHUP_EVENTS = 10 * EVENTS_PAGE_SIZE;

export const sessionEventsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/sessions/:id/events — SSE stream of session events
  fastify.get<{
    Params: { id: string };
    Reply: void | ProblemDetails;
  }>(
    "/:id/events",
    {
      preHandler: [requireAuth, ...requireSessionAccess],
      schema: {
        summary: "Stream session events (SSE)",
        operationId: "streamSessionEvents",
        description:
          "Server-Sent Events stream for real-time session updates. " +
          "Drains existing events from the database on connect (paging past the " +
          "internal page size until history is exhausted or a bound is hit), then " +
          "streams new events live via an in-process subscription until the " +
          "session completes. If the persisted history exceeds the bound, an " +
          "`events:truncated` event is sent before the stream continues live.",
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
          404: { $ref: "AgentProblemDetails#" },
        },
      },
    },
    async (request, reply) => {
      const session = request.agentSession;
      // The requireSessionAccess guard (chained above) already enforced
      // owner-or-admin with 404-on-deny, hiding session existence from
      // non-owners; webhook-origin (userId === null) sessions are admin-only.
      // A surviving null here means the session does not exist (admins are
      // admitted before this null-check), so return the same 404.
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
        // Catch-up: drain persisted history page by page via the afterId
        // cursor, until either the history is exhausted (a short page) or
        // MAX_CATCHUP_EVENTS is hit. Without this loop, a session with more
        // than one page of events would replay only the oldest page and
        // silently jump to live, dropping everything in between.
        let afterId: string | undefined;
        let deliveredCount = 0;
        let truncated = false;
        for (;;) {
          const page = await sessionService.listEvents(session.id, afterId);
          for (const event of page) {
            deliver(event);
          }
          deliveredCount += page.length;

          const lastEvent = page[page.length - 1];
          if (lastEvent) {
            afterId = lastEvent.id;
          }

          // Check the bound before the short-page break: a session with
          // exactly MAX_CATCHUP_EVENTS persisted events ends on a full page,
          // and fetching one more (empty) page is the only way to tell "that
          // was everything" apart from "there's more" without a false
          // events:truncated marker on the exact boundary.
          if (deliveredCount > MAX_CATCHUP_EVENTS) {
            truncated = true;
            break;
          }
          if (page.length < EVENTS_PAGE_SIZE) {
            break;
          }
        }

        if (truncated) {
          sendEvent("events:truncated", { sessionId: session.id, deliveredCount });
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
