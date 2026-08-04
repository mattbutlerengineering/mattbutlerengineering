import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, WaitlistJoinResult } from "@mbe/types";
import {
  createProblemDetails,
  waitlistJoinResultJsonSchema,
  publicWaitlistBodyJsonSchema,
} from "@mbe/types";
import { venueService } from "../services/venue.js";
import { waitlistService } from "../services/waitlist.js";
import { validatePhone } from "../services/waitlist-notifier.js";

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
          position: entry.position,
          estimatedWaitMinutes: entry.estimatedWaitMinutes,
        },
      });
    }
  );
};
