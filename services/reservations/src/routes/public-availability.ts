import type { FastifyPluginAsync } from "fastify";
import type { TimeSlot, ApiResponse } from "@mbe/types";
import { createProblemDetails, publicAvailabilityQueryJsonSchema } from "@mbe/types";
import { validatePartySize } from "@mbe/database";
import { venueService } from "../services/venue.js";
import { availabilityService } from "../services/availability.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

export const publicAvailabilityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { slug: string };
    Querystring: { date: string; partySize: string };
    Reply: ApiResponse<TimeSlot[]> | ReturnType<typeof createProblemDetails>;
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
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { date, partySize } = request.query;

      // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
      // run the rest of the lookup (venue re-fetch + slot generation) inside
      // that venue's RLS context, never an unscoped slug read.
      const venueId = await resolveVenueId("venue_slug", slug);
      if (!venueId) {
        return reply
          .status(404)
          .send(
            createProblemDetails(404, "Venue Not Found", `No venue found with slug '${slug}'.`)
          );
      }

      return runWithVenueContext(venueId, async () => {
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

        const slots = await availabilityService.generateTimeSlots(
          venue.id,
          date,
          partySizeResult.value
        );
        const availableOnly = slots.filter((s: TimeSlot) => s.available);

        return reply.send({ data: availableOnly });
      });
    }
  );
};
