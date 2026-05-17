import type { FastifyPluginAsync } from "fastify";
import type { TimeSlot, ApiResponse } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { availabilityService } from "../services/availability.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";

export const publicAvailabilityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { slug: string };
    Querystring: { date: string; partySize: string };
    Reply: ApiResponse<TimeSlot[]>;
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
        querystring: {
          type: "object",
          properties: {
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            partySize: { type: "string" },
          },
          required: ["date", "partySize"],
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { date, partySize } = request.query;

      const venue = await venueService.getBySlug(slug);
      if (!venue) {
        return reply.status(404).send({
          type: "https://httpproblems.com/http-status/404",
          title: "Venue Not Found",
          status: 404,
          detail: `No venue found with slug '${slug}'.`,
        } as never);
      }

      const parsedPartySize = parseInt(partySize, 10);
      if (isNaN(parsedPartySize) || parsedPartySize < 1) {
        return reply.status(400).send({
          type: "https://httpproblems.com/http-status/400",
          title: "Invalid Party Size",
          status: 400,
          detail: "partySize must be a positive integer.",
        } as never);
      }

      const slots = await availabilityService.getTimeSlots(venue.id, date, parsedPartySize);
      const availableOnly = slots.filter((s) => s.available);

      return reply.send({ data: availableOnly });
    }
  );
};
