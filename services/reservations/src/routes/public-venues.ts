import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, PublicVenueConfig } from "@mbe/types";
import { createProblemDetails, publicVenueConfigJsonSchema } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

export const publicVenueRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema(publicVenueConfigJsonSchema);

  fastify.get<{
    Params: { slug: string };
    Reply: ApiResponse<PublicVenueConfig> | ReturnType<typeof createProblemDetails>;
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

      // ADR-026 §3.3 item 3: resolve the venue through the SECURITY DEFINER
      // `app_resolve_venue_id` (#5369 PR 3) rather than reading `venues` by
      // slug unscoped — the exact unscoped-read trap this closes — then run
      // the rest of the lookup inside that venue's RLS context.
      const venueId = await resolveVenueId("venue_slug", slug);
      if (!venueId) {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
      }

      return runWithVenueContext(venueId, async () => {
        const publicVenue = await venueService.getPublicConfigBySlug(slug);

        if (!publicVenue) {
          return reply
            .status(404)
            .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
        }

        return reply.send({ data: publicVenue });
      });
    }
  );
};
