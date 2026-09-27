import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ApiResponse, Reservation, ReservationHold } from "@mbe/types";
import {
  createProblemDetails,
  publicHoldBodyJsonSchema,
  publicHoldConfirmBodyJsonSchema,
} from "@mbe/types";
import { randomUUID } from "crypto";
import { holdService } from "../services/hold.js";
import { confirmHold } from "../services/confirm-hold.js";
import { generateManageToken } from "./public-reservations.js";
import { withoutGuestLink } from "../services/serializers.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import {
  getActiveHoldCount,
  incrementHoldCount,
  decrementHoldCount,
  MAX_ACTIVE_HOLDS,
} from "../middleware/public-rate-limit.js";

const SESSION_ID_HEADER = "x-session-id";

/** hold-confirm failure code -> HTTP status, shared with the staff route. */
const CONFIRM_ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  EXPIRED: 410,
  SESSION_MISMATCH: 403,
  CONFLICT: 409,
  PACING_EXCEEDED: 422,
};

const CONFIRM_ERROR_TITLE: Record<string, string> = {
  NOT_FOUND: "Not Found",
  EXPIRED: "Hold Expired",
  SESSION_MISMATCH: "Forbidden",
  CONFLICT: "Conflict",
  PACING_EXCEEDED: "Pacing Limit Reached",
};

/**
 * Server-side venue resolution: every public hold route names its venue by
 * slug and looks it up here, never trusting a client-supplied `venueId`.
 *
 * Resolves through `resolveVenueId("venue_slug", ...)` (ADR-026 §3.3 item 3)
 * rather than a plain `venueService.getBySlug` — that would be an unscoped
 * read of an RLS-protected table, exactly the trap this closes under
 * `FORCE ROW LEVEL SECURITY`.
 *
 * Returns the resolved venue id, or `null` having already replied 404.
 */
async function resolveVenueBySlug(slug: string, reply: FastifyReply): Promise<string | null> {
  const venueId = await resolveVenueId("venue_slug", slug);
  if (!venueId) {
    reply
      .status(404)
      .send(createProblemDetails(404, "Venue Not Found", `No venue found with slug '${slug}'.`));
    return null;
  }
  return venueId;
}

/**
 * The high-entropy sessionId returned at hold creation is the caller's
 * capability token. Requiring it prevents one guest from reading, releasing or
 * confirming another guest's hold — the hold id itself is a low-entropy,
 * guessable cuid and must not be treated as proof of ownership.
 *
 * Returns the session id, or `null` having already replied 401.
 */
function readSessionId(request: FastifyRequest, reply: FastifyReply, verb: string): string | null {
  const sessionId = request.headers[SESSION_ID_HEADER];
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    reply.status(401).send({
      type: "https://httpproblems.com/http-status/401",
      title: "Unauthorized",
      status: 401,
      detail: `Pass the hold's session ID via the ${SESSION_ID_HEADER} header to ${verb} it.`,
    });
    return null;
  }
  return sessionId;
}

export const publicHoldRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { slug: string };
    Body: { date: string; startTime: string; endTime: string; partySize: number };
    Reply: ApiResponse<ReservationHold> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/holds",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Create a reservation hold (public)",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
        body: publicHoldBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { date, startTime, partySize } = request.body;
      const ip = request.ip;

      if (getActiveHoldCount(ip) >= MAX_ACTIVE_HOLDS) {
        return reply
          .status(429)
          .send(
            createProblemDetails(
              429,
              "Too Many Holds",
              `Maximum ${MAX_ACTIVE_HOLDS} active holds per session.`
            )
          );
      }

      const venueId = await resolveVenueBySlug(slug, reply);
      if (venueId === null) return reply;

      return runWithVenueContext(venueId, async () => {
        const sessionId = randomUUID();
        const result = await holdService.create(
          { venueId, date, time: startTime, partySize },
          sessionId
        );

        if (!result.success) {
          return reply
            .status(409)
            .send(
              createProblemDetails(
                409,
                "Slot Unavailable",
                result.error ?? "The requested time slot is no longer available."
              )
            );
        }

        incrementHoldCount(ip);
        return reply.status(201).send({ data: result.hold! });
      });
    }
  );

  fastify.delete<{
    Params: { slug: string; holdId: string };
  }>(
    "/:slug/holds/:holdId",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Release a reservation hold (public)",
        tags: ["Public"],
      },
    },
    async (request, reply) => {
      const { holdId } = request.params;
      const ip = request.ip;

      // Session-id ownership check — see readSessionId's doc comment for why
      // the hold id itself is not proof of ownership.
      const sessionId = readSessionId(request, reply, "release");
      if (sessionId === null) return reply;

      const released = await holdService.release(holdId, sessionId);
      if (released) {
        decrementHoldCount(ip);
      }

      return reply.status(204).send();
    }
  );

  // GET the hold's status. The staff counterpart (/api/v1/holds/:id) is
  // addressed by hold id alone; this one resolves the venue from the slug and
  // requires the creating session, so a guessed hold id reveals nothing (#4487).
  fastify.get<{
    Params: { slug: string; holdId: string };
    Reply: ApiResponse<ReservationHold> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/holds/:holdId",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Get a reservation hold's status (public)",
        tags: ["Public"],
      },
    },
    async (request, reply) => {
      const { slug, holdId } = request.params;

      const sessionId = readSessionId(request, reply, "read");
      if (sessionId === null) return reply;

      const venueId = await resolveVenueBySlug(slug, reply);
      if (venueId === null) return reply;

      return runWithVenueContext(venueId, async () => {
        const hold = await holdService.getById(holdId);
        // A hold from another venue, or one this session does not own, is
        // reported as absent — never as a distinct status that would confirm it
        // exists somewhere.
        if (!hold || hold.venueId !== venueId || hold.sessionId !== sessionId) {
          return reply
            .status(404)
            .send(createProblemDetails(404, "Not Found", "Hold not found or expired."));
        }

        return reply.send({ data: hold });
      });
    }
  );

  // Confirm the hold into a reservation. Mirrors the staff route's response
  // shape (`{ data, manageToken? }`) so one api-client method covers both, but
  // adds slug scoping and drops `guestId` from the accepted body (#4487).
  fastify.post<{
    Params: { slug: string; holdId: string };
    Body: { guestName?: string; guestEmail?: string; guestPhone?: string; notes?: string };
    Reply:
      | (ApiResponse<Reservation> & { manageToken?: string })
      | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/holds/:holdId/confirm",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Confirm a reservation hold (public)",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug", "holdId"],
          properties: { slug: { type: "string" }, holdId: { type: "string" } },
        },
        body: publicHoldConfirmBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const { slug, holdId } = request.params;
      const ip = request.ip;

      const sessionId = readSessionId(request, reply, "confirm");
      if (sessionId === null) return reply;

      const venueId = await resolveVenueBySlug(slug, reply);
      if (venueId === null) return reply;

      return runWithVenueContext(venueId, async () => {
        // Fields are named explicitly rather than forwarding the parsed body:
        // Fastify leaves unknown properties on `request.body`, so spreading it
        // would let an anonymous caller smuggle a `guestId` and attach its
        // reservation to someone else's guest record.
        const { guestName, guestEmail, guestPhone, notes } = request.body;
        const result = await confirmHold({
          holdId,
          sessionId,
          venueId,
          guestDetails: { guestName, guestEmail, guestPhone, notes },
        });

        if (!result.success) {
          const httpStatus = CONFIRM_ERROR_STATUS[result.errorCode] ?? 409;
          const title = CONFIRM_ERROR_TITLE[result.errorCode] ?? "Conflict";
          return reply
            .status(httpStatus)
            .send(createProblemDetails(httpStatus, title, result.error));
        }

        // The hold is consumed, so it no longer counts against the per-IP
        // active-hold cap — same bookkeeping the release path does.
        decrementHoldCount(ip);

        // Only mint a manage token when an email was actually supplied: a
        // phone-only booking is stored with `guestEmail: null`, and a token
        // signed with "" could never validate against it.
        const manageToken = guestEmail
          ? generateManageToken(result.reservation.id, guestEmail)
          : undefined;

        return reply.status(201).send({ data: withoutGuestLink(result.reservation), manageToken });
      });
    }
  );
};
