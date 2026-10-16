import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, GuestRiskResult } from "@mbe/types";
import {
  createProblemDetails,
  guestRiskResultJsonSchema,
  publicGuestRiskQueryJsonSchema,
} from "@mbe/types";
import { assessGuestReliability } from "../services/guest-reliability.js";
import { publicVenueScoped } from "./public-venue-scope.js";

export const publicGuestRiskRoutes: FastifyPluginAsync = async (fastify) => {
  const { guestService, venueService } = fastify.services;

  fastify.addSchema(guestRiskResultJsonSchema);

  fastify.get<{
    Params: { slug: string };
    Querystring: { email?: string; phone?: string };
    Reply: ApiResponse<GuestRiskResult> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/guest-risk",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
      schema: {
        summary: "Get guest deposit requirement (public)",
        description:
          "Returns whether the booking widget should show a deposit step. Rate-limited to 20 req/min per IP.",
        tags: ["Public"],
        params: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
        },
        querystring: publicGuestRiskQueryJsonSchema,
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "GuestRiskResult#" } },
          },
        },
      },
    },
    publicVenueScoped(
      {
        slug: (request) => request.params.slug,
        // The missing-query 400 answers before the slug lookup, as it always did.
        before: (request, reply) =>
          !request.query.email && !request.query.phone
            ? reply
                .status(400)
                .send(
                  createProblemDetails(
                    400,
                    "Bad Request",
                    "email or phone query parameter is required"
                  )
                )
            : undefined,
      },
      async (request, reply) => {
        const { slug } = request.params;
        const { email, phone } = request.query;

        // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
        // run the guest lookup inside that venue's RLS context.

        const venue = await venueService.getBySlug(slug);
        if (!venue) {
          return reply
            .status(404)
            .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
        }

        const guest = email
          ? await guestService.findByEmail(venue.id, email)
          : phone
            ? await guestService.findByPhone(venue.id, phone)
            : null;

        if (!guest) {
          // Unknown guest — no deposit. The named score stays off this public body.
          return reply.send({
            data: { requiresDeposit: false },
          });
        }

        const riskScore = assessGuestReliability(guest, venue.settings);

        return reply.send({
          data: {
            requiresDeposit: riskScore === "risky",
          },
        });
      }
    )
  );
};
