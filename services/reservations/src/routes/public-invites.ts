import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { addInviteRsvp, getInvitePublicView } from "../services/reservation-invite.js";

const rsvpBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["firstName", "status"],
  properties: {
    // Letters (any script), combining marks, spaces, apostrophes, hyphens and periods; must start with a letter.
    firstName: {
      type: "string",
      minLength: 1,
      maxLength: 40,
      pattern: "^\\p{L}[\\p{L}\\p{M} '’.-]*$",
    },
    status: { enum: ["IN", "OUT"] },
  },
} as const;

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

  fastify.post<{ Params: { token: string }; Body: { firstName: string; status: "IN" | "OUT" } }>(
    "/public/v1/invites/:token/rsvp",
    {
      schema: { body: rsvpBodySchema },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const result = await addInviteRsvp(request.params.token, {
        firstName: request.body.firstName.trim(),
        status: request.body.status,
      });
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
      if (result.kind === "full") {
        return reply
          .status(409)
          .send(createProblemDetails(409, "Invitation Full", "This invitation has no spots left"));
      }
      return reply.status(201).send({ data: { ok: true } });
    }
  );
};
