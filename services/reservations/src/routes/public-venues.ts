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
      const publicVenue = await venueService.getPublicConfigBySlug(slug);

      if (!publicVenue) {
        return reply.status(404).send({
          success: false,
          error: "Venue not found",
        } as never);
      }

      return reply.send({ data: publicVenue });
    }
  );
};
