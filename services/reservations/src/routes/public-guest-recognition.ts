import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, GuestRecognition } from "@mbe/types";
import {
  createProblemDetails,
  guestRecognitionJsonSchema,
  publicGuestRecognitionQueryJsonSchema,
} from "@mbe/types";
import { publicVenueScoped } from "./public-venue-scope.js";

const UNRECOGNIZED: GuestRecognition = {
  recognized: false,
  firstName: null,
  visitCount: 0,
  hasPreferences: false,
};

export const publicGuestRecognitionRoutes: FastifyPluginAsync = async (fastify) => {
  const { venueService } = fastify.services;

  fastify.addSchema(guestRecognitionJsonSchema);

  fastify.get<{
    Params: { slug: string };
    Querystring: { email?: string };
    Reply: ApiResponse<GuestRecognition> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/guests/recognize",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        summary: "Recognize a guest by email (public)",
        description:
          "Read-only lookup that returns limited guest info for the booking widget. No auth required. Rate-limited to 10 req/min per IP.",
        tags: ["Public"],
        params: {
          type: "object",
          properties: {
            slug: { type: "string" },
          },
          required: ["slug"],
        },
        querystring: publicGuestRecognitionQueryJsonSchema,
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "GuestRecognition#" } },
          },
        },
      },
    },
    publicVenueScoped({ slug: (request) => request.params.slug }, async (request, reply) => {
      const { slug } = request.params;
      const { email } = request.query;

      if (!email) {
        return reply
          .status(400)
          .send(createProblemDetails(400, "Bad Request", "email query parameter is required"));
      }

      // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
      // run the guest lookup inside that venue's RLS context.

      const venue = await venueService.getBySlug(slug);
      if (!venue) {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
      }

      // An unauthenticated caller has not proved they own `email`, so answering would tell anyone
      // whether that person is a guest here, their first name and how often they come. Always
      // answer "not recognized" until recognition sits behind proof of the address.
      return reply.send({ data: UNRECOGNIZED });
    })
  );
};
