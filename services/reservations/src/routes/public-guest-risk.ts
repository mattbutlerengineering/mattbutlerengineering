import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, GuestRiskResult } from "@mbe/types";
import { guestRiskResultJsonSchema } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { guestService } from "../services/guest.js";
import { assessGuestReliability } from "../services/guest-reliability.js";

export const publicGuestRiskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema(guestRiskResultJsonSchema);

  fastify.get<{
    Params: { slug: string };
    Querystring: { email?: string; phone?: string };
    Reply: ApiResponse<GuestRiskResult>;
  }>(
    "/:slug/guest-risk",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
      schema: {
        summary: "Get guest risk score (public)",
        description:
          "Returns guest risk score for the booking widget. Used to determine if a deposit step should be shown. Rate-limited to 20 req/min per IP.",
        tags: ["Public"],
        params: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
        },
        querystring: {
          type: "object",
          properties: {
            email: { type: "string" },
            phone: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "GuestRiskResult#" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { email, phone } = request.query;

      if (!email && !phone) {
        return reply.status(400).send({
          success: false,
          error: "email or phone query parameter is required",
        } as never);
      }

      const venue = await venueService.getBySlug(slug);
      if (!venue) {
        return reply.status(404).send({
          success: false,
          error: "Venue not found",
        } as never);
      }

      const guest = email
        ? await guestService.findByEmail(venue.id, email)
        : phone
          ? await guestService.findByPhone(venue.id, phone)
          : null;

      if (!guest) {
        // New guest — always trusted
        return reply.send({
          data: { riskScore: "trusted", requiresDeposit: false },
        });
      }

      const riskScore = assessGuestReliability(guest, venue.settings);

      return reply.send({
        data: {
          riskScore,
          requiresDeposit: riskScore === "risky",
        },
      });
    }
  );
};
