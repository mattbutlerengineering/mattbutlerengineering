import type { FastifyPluginAsync } from "fastify";
import type { TimeSlot, ApiResponse } from "@mbe/types";
import { createProblemDetails, publicAvailabilityQueryJsonSchema } from "@mbe/types";
import { validatePartySize } from "@mbe/database";
import { venueService } from "../services/venue.js";
import { availabilityService } from "../services/availability.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";

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
    }
  );
};
