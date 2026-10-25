import type { FastifyPluginAsync } from "fastify";
import type { PublicAvailabilityResponse } from "@mbe/types";
import {
  createProblemDetails,
  publicAvailabilityQueryJsonSchema,
  publicAvailabilityResponseJsonSchema,
} from "@mbe/types";
import { validatePartySize } from "@mbe/database";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { publicVenueScoped } from "./public-venue-scope.js";

export const publicAvailabilityRoutes: FastifyPluginAsync = async (fastify) => {
  const { availabilityService, venueService } = fastify.services;

  fastify.get<{
    Params: { slug: string };
    Querystring: { date: string; partySize: string };
    Reply: PublicAvailabilityResponse | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/availability",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Get available time slots (public)",
        tags: ["Public"],
        params: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
        },
        querystring: publicAvailabilityQueryJsonSchema,
        // Engine-computed: the slots, plus `closure` for a closed date and
        // `bookingPaused` while online booking is paused (@mbe/types pins both).
        response: { 200: publicAvailabilityResponseJsonSchema },
      },
    },
    publicVenueScoped(
      {
        slug: (request) => request.params.slug,
        notFound: (slug) => ({
          title: "Venue Not Found",
          detail: `No venue found with slug '${slug}'.`,
        }),
      },
      async (request, reply) => {
        const { slug } = request.params;
        const { date, partySize } = request.query;

        // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
        // run the rest of the lookup (venue re-fetch + slot generation) inside
        // that venue's RLS context, never an unscoped slug read.

        const venue = await venueService.getBySlug(slug);
        if (!venue) {
          return reply
            .status(404)
            .send(
              createProblemDetails(404, "Venue Not Found", `No venue found with slug '${slug}'.`)
            );
        }

        const partySizeResult = validatePartySize(partySize);
        if (!partySizeResult.valid) {
          return reply
            .status(400)
            .send(createProblemDetails(400, "Invalid Party Size", partySizeResult.error));
        }

        const { slots, ...notices } = await availabilityService.getDayAvailability(
          venue.id,
          date,
          partySizeResult.value,
          undefined,
          { logger: request.log }
        );

        return reply.send({ data: slots.filter((s) => s.available), ...notices });
      }
    )
  );
};
