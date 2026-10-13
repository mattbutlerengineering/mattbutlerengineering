import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, WaitlistEstimate, WaitlistJoinResult } from "@mbe/types";
import {
  createProblemDetails,
  waitlistJoinResultJsonSchema,
  waitlistEstimateJsonSchema,
  publicWaitlistBodyJsonSchema,
} from "@mbe/types";
import { venueService } from "../services/venue.js";
import { waitlistService } from "../services/waitlist.js";
import { validatePhone } from "../services/waitlist-notifier.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

interface PublicWaitlistJoinBody {
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
}

/**
 * Public (unauthenticated) endpoint for joining a venue's walk-in waitlist from
 * the booking widget. Mirrors the authenticated `POST /api/v1/waitlist` create
 * flow, but resolves the venue from the slug (never trusts a client-supplied
 * venueId) and returns only the minimal `{ position, estimatedWaitMinutes }`
 * shape the widget needs — no guest PII in the response.
 */
export const publicWaitlistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema(waitlistJoinResultJsonSchema);
  fastify.addSchema(waitlistEstimateJsonSchema);

  fastify.post<{
    Params: { slug: string };
    Body: PublicWaitlistJoinBody;
    Reply: ApiResponse<WaitlistJoinResult> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/waitlist",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
      schema: {
        summary: "Join the walk-in waitlist (public)",
        description:
          "Adds a guest to a venue's walk-in waitlist from the unauthenticated booking widget. Rate-limited to 20 req/min per IP.",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
        body: publicWaitlistBodyJsonSchema,
        response: {
          201: {
            type: "object",
            properties: { data: { $ref: "WaitlistJoinResult#" } },
          },
          400: { $ref: "Error#" },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { partySize, guestName, guestPhone } = request.body;

      // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
      // run the rest of the join inside that venue's RLS context — never the
      // client-supplied body.venueId, which could target another venue.
      const venueId = await resolveVenueId("venue_slug", slug);
      if (!venueId) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
      }

      return runWithVenueContext(venueId, async () => {
        const venue = await venueService.getBySlug(slug);
        if (!venue) {
          return reply
            .code(404)
            .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
        }

        if (!validatePhone(guestPhone)) {
          return reply
            .code(400)
            .send(createProblemDetails(400, "Bad Request", "Invalid phone number"));
        }

        // Always join under the venue resolved from the trusted slug — never the
        // client-supplied body.venueId, which could target another venue.
        const entry = await waitlistService.create({
          venueId: venue.id,
          partySize,
          guestName,
          guestPhone,
        });

        // Fire-and-forget: SMS delivery failures must not block the response
        fastify.waitlistNotifier
          .notifyAdded({
            id: entry.id,
            guestPhone: entry.guestPhone,
            guestName: entry.guestName,
            position: entry.position,
            estimatedWaitMinutes: entry.estimatedWaitMinutes,
          })
          .catch(() => {
            // Already logged inside the notifier
          });

        return reply.code(201).send({
          data: {
            entryId: entry.id,
            position: entry.position,
            estimatedWaitMinutes: entry.estimatedWaitMinutes,
          },
        });
      });
    }
  );
  // Live read of the guest's OWN entry. The entry id (returned only to the
  // joiner) is the capability; the response carries no PII. Rate limiting stays
  // on the global onRequest limiter - no route-level config.rateLimit here.
  fastify.get<{
    Params: { slug: string; entryId: string };
    Reply: ApiResponse<WaitlistEstimate> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/waitlist/:entryId",
    {
      schema: {
        summary: "Read a waitlist entry's live position and estimate (public)",
        description:
          "Returns the current position and wait estimate for the guest's own waitlist entry, addressed by the entry id returned when they joined.",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug", "entryId"],
          properties: { slug: { type: "string" }, entryId: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "WaitlistEstimate#" } },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { slug, entryId } = request.params;
      const notFound = () =>
        reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "No such waitlist entry for this venue."));

      const venueId = await resolveVenueId("venue_slug", slug);
      if (!venueId) return notFound();

      return runWithVenueContext(venueId, async () => {
        const entry = await waitlistService.getById(entryId);
        // An entry from another venue is indistinguishable from a missing one.
        if (!entry || entry.venueId !== venueId) return notFound();

        return reply.send({
          data: {
            position: entry.position,
            estimatedWaitMinutes: entry.estimatedWaitMinutes,
            status: entry.status,
          },
        });
      });
    }
  );
};
