import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { createInvite, getInviteSummaryForReservation } from "../services/reservation-invite.js";

/**
 * Booker side of The Invitation (#8665), authenticated by the manage token. The invite
 * token minted here is random and independent of the manage token, and the responses carry
 * no booker PII: the invite token only, or RSVP counts.
 */
export const manageInviteRoutes: FastifyPluginAsync = async (fastify) => {
  const missing = {
    missing: (reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
      reply.status(404).send(reservationNotFoundProblem()),
  };

  fastify.post(
    "/public/v1/reservations/manage/invite",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    manageTokenScoped(missing, async (_request, reply, { venueId, reservation }) => {
      if (reservation.status === "CANCELLED") {
        return reply
          .status(409)
          .send(
            createProblemDetails(409, "Cannot Invite", "A cancelled reservation cannot be shared")
          );
      }
      const { token } = await createInvite({ venueId, reservationId: reservation.id });
      return reply.status(201).send({ data: { inviteToken: token } });
    })
  );

  fastify.get(
    "/public/v1/reservations/manage/invite",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    manageTokenScoped(missing, async (_request, reply, { venueId, reservation }) => {
      const summary = await getInviteSummaryForReservation({
        venueId,
        reservationId: reservation.id,
      });
      return reply.status(200).send({ data: { ...summary, partySize: reservation.partySize } });
    })
  );
};
