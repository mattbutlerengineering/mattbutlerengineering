import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { getInvitePublicView } from "../services/reservation-invite.js";

/**
 * Public party-invite view (The Invitation, #8662). The invite token only reads
 * this allow-listed payload; it never grants manage/cancel rights, which stay on
 * the signed manage token. The response is rebuilt field by field so a service
 * change can never leak booker PII, notes or ids.
 */
export const publicInviteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { token: string } }>(
    "/public/v1/invites/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const result = await getInvitePublicView(request.params.token);
      if (result.kind === "missing") {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", "This invitation was not found"));
      }
      if (result.kind === "gone") {
        return reply
          .status(410)
          .send(
            createProblemDetails(410, "Invitation Ended", "This invitation is no longer available")
          );
      }
      const { venue, date, time, partySize, rsvps, status } = result.view;
      return reply.status(200).send({
        data: {
          venue: { name: venue.name, slug: venue.slug },
          date,
          time,
          partySize,
          rsvps: rsvps.map((r) => ({ firstName: r.firstName, status: r.status })),
          status,
        },
      });
    }
  );
};
