import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse } from "@mbe/types";
import { venueService } from "../services/venue.js";

interface PublicVenueResponse {
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: unknown;
  settings: {
    defaultReservationDuration?: number;
    maxPartySize?: number;
    maxAdvanceBooking?: number;
    slotIntervalMinutes?: number;
  };
}

export const publicVenueRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { slug: string };
    Reply: ApiResponse<PublicVenueResponse>;
  }>(
    "/:slug",
    {
      schema: {
        summary: "Get public venue info by slug",
        tags: ["Public"],
        params: {
          type: "object",
          properties: {
            slug: { type: "string" },
          },
          required: ["slug"],
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const venue = await venueService.getBySlug(slug);

      if (!venue) {
        return reply.status(404).send({
          success: false,
          error: "Venue not found",
        } as never);
      }

      const publicVenue: PublicVenueResponse = {
        name: venue.name,
        slug: venue.slug,
        ianaTimezone: venue.ianaTimezone,
        currencyCode: venue.currencyCode,
        operatingHours: venue.operatingHours,
        settings: {
          defaultReservationDuration: venue.settings?.defaultReservationDuration,
          maxPartySize: venue.settings?.maxPartySize,
          maxAdvanceBooking: venue.settings?.maxAdvanceBooking,
          slotIntervalMinutes: venue.settings?.slotIntervalMinutes,
        },
      };

      return reply.send({ data: publicVenue });
    }
  );
};
