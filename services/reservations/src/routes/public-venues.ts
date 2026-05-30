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
  deposit: {
    enabled: boolean;
    depositType: string | null;
    amountCents: number | null;
    freeCancellationHours: number | null;
    lateCancellationFeePercent: number | null;
    noShowFeePercent: number | null;
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

      // Fetch deposit-specific fields (not on the mapped Venue type) via service
      const rawVenue = await venueService.getRawBySlug(slug);

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
        deposit: {
          enabled: rawVenue?.depositEnabled ?? false,
          depositType: rawVenue?.depositType ?? null,
          amountCents: rawVenue?.depositAmountCents ?? null,
          freeCancellationHours: rawVenue?.freeCancellationHours ?? null,
          lateCancellationFeePercent: rawVenue?.lateCancellationFeePercent ?? null,
          noShowFeePercent: rawVenue?.noShowFeePercent ?? null,
        },
      };

      return reply.send({ data: publicVenue });
    }
  );
};
