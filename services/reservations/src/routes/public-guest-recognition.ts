import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { recognizeGuest, type GuestRecognition } from "../services/guest-recognition.js";

export const publicGuestRecognitionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { slug: string };
    Querystring: { email?: string };
    Reply: ApiResponse<GuestRecognition>;
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
        querystring: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
          },
          required: ["email"],
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { email } = request.query;

      if (!email) {
        return reply.status(400).send({
          success: false,
          error: "email query parameter is required",
        } as never);
      }

      const venue = await venueService.getBySlug(slug);

      if (!venue) {
        return reply.status(404).send({
          success: false,
          error: "Venue not found",
        } as never);
      }

      const recognition = await recognizeGuest(venue.id, email);

      return reply.send({ data: recognition });
    }
  );
};
