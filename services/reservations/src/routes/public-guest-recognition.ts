import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, GuestRecognition } from "@mbe/types";
import {
  createProblemDetails,
  guestRecognitionJsonSchema,
  publicGuestRecognitionQueryJsonSchema,
} from "@mbe/types";
import { venueService } from "../services/venue.js";
import { recognizeGuest } from "../services/guest-recognition.js";

export const publicGuestRecognitionRoutes: FastifyPluginAsync = async (fastify) => {
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
    async (request, reply) => {
      const { slug } = request.params;
      const { email } = request.query;

      if (!email) {
        return reply
          .status(400)
          .send(createProblemDetails(400, "Bad Request", "email query parameter is required"));
      }

      const venue = await venueService.getBySlug(slug);

      if (!venue) {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
      }

      const recognition = await recognizeGuest(venue.id, email);

      return reply.send({ data: recognition });
    }
  );
};
