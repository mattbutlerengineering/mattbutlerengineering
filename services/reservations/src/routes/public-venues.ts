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
      const rawVenue = await venueService.getRawBySlug(slug);

      if (!rawVenue) {
        return reply.status(404).send({
          success: false,
          error: "Venue not found",
        } as never);
      }

      const settings = rawVenue.settings as Record<string, unknown> | null;

      const publicVenue: PublicVenueResponse = {
        name: rawVenue.name,
        slug: rawVenue.slug,
        ianaTimezone: rawVenue.ianaTimezone,
        currencyCode: rawVenue.currencyCode,
        operatingHours: rawVenue.operatingHours,
        settings: {
          defaultReservationDuration: settings?.defaultReservationDuration as number | undefined,
          maxPartySize: settings?.maxPartySize as number | undefined,
          maxAdvanceBooking: settings?.maxAdvanceBooking as number | undefined,
          slotIntervalMinutes: settings?.slotIntervalMinutes as number | undefined,
        },
        deposit: {
          enabled: rawVenue.depositEnabled,
          depositType: rawVenue.depositType,
          amountCents: rawVenue.depositAmountCents,
          freeCancellationHours: rawVenue.freeCancellationHours,
          lateCancellationFeePercent: rawVenue.lateCancellationFeePercent,
          noShowFeePercent: rawVenue.noShowFeePercent,
        },
      };

      return reply.send({ data: publicVenue });
    }
  );
};
