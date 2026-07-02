import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, PublicVenueConfig } from "@mbe/types";
import { publicVenueConfigJsonSchema } from "@mbe/types";
import { venueService } from "../services/venue.js";

export const publicVenueRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema(publicVenueConfigJsonSchema);

  fastify.get<{
    Params: { slug: string };
    Reply: ApiResponse<PublicVenueConfig>;
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
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "PublicVenueConfig#" } },
          },
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

      const publicVenue: PublicVenueConfig = {
        name: rawVenue.name,
        slug: rawVenue.slug,
        ianaTimezone: rawVenue.ianaTimezone,
        currencyCode: rawVenue.currencyCode,
        operatingHours: rawVenue.operatingHours as PublicVenueConfig["operatingHours"],
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
