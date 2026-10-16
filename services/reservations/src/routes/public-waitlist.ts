import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, WaitlistEstimate, WaitlistJoinResult } from "@mbe/types";
import {
  createProblemDetails,
  waitlistJoinResultJsonSchema,
  waitlistEstimateJsonSchema,
  publicWaitlistBodyJsonSchema,
} from "@mbe/types";
import { validatePhone } from "../services/waitlist-notifier.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import {
  generateWaitlistStatusToken,
  verifyWaitlistStatusToken,
} from "../services/waitlist-status-token.js";
import { publicVenueScoped } from "./public-venue-scope.js";

const STATUS_NOT_FOUND_DETAIL = "No such waitlist entry for this venue.";

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
  const { venueService, waitlistService } = fastify.services;

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
    publicVenueScoped({ slug: (request) => request.params.slug }, async (request, reply) => {
      const { slug } = request.params;
      const { partySize, guestName, guestPhone } = request.body;

      // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
      // run the rest of the join inside that venue's RLS context — never the
      // client-supplied body.venueId, which could target another venue.

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
          statusToken: generateWaitlistStatusToken(entry.id, venue.id),
          position: entry.position,
          estimatedWaitMinutes: entry.estimatedWaitMinutes,
        },
      });
    })
  );
  // Live read of the guest's OWN entry. The credential is the signed,
  // expiring status token minted at join - never the guessable entry id. The
  // response carries no PII. Rate limiting is publicRateLimitHook plus the
  // global onRequest limiter; no route-level config.rateLimit (see gotchas §
  // Fastify / rate limiting).
  fastify.get<{
    Params: { slug: string };
    Querystring: { token: string };
    Reply: ApiResponse<WaitlistEstimate> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/waitlist/status",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Read a waitlist entry's live position and estimate (public)",
        description:
          "Returns the current position and wait estimate for the guest's own waitlist entry, addressed by the status token returned when they joined.",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
        querystring: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string", minLength: 1, maxLength: 512 } },
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
    publicVenueScoped(
      {
        slug: (request) => request.params.slug,
        // One detail for every failure (bad token, wrong venue, gone entry,
        // unknown slug) so the response is not an oracle.
        notFound: () => ({ title: "Not Found", detail: STATUS_NOT_FOUND_DETAIL }),
      },
      async (request, reply, { venueId }) => {
        const notFound = () =>
          reply.code(404).send(createProblemDetails(404, "Not Found", STATUS_NOT_FOUND_DETAIL));

        const verified = verifyWaitlistStatusToken(request.query.token, venueId);
        if (!verified.valid) return notFound();

        const entry = await waitlistService.getById(verified.entryId);
        if (!entry || entry.venueId !== venueId) return notFound();

        const [live] = await waitlistService.withLiveEstimates([entry]);
        return reply.send({
          data: {
            position: entry.position,
            estimatedWaitMinutes: (live ?? entry).estimatedWaitMinutes,
            status: entry.status,
          },
        });
      }
    )
  );
};
