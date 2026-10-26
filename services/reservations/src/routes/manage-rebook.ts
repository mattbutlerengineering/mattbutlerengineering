import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { gateProblem } from "../services/assert-bookable.js";
import { defaultRebookDeps } from "../services/manage-rebook-deps.js";
import { rebookVenueCancelled, type RebookDeps } from "../services/manage-rebook.js";
import { guestActor } from "../services/reservation-events.js";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { generateManageToken } from "./public-reservations.js";

const bodySchema = {
  type: "object",
  required: ["offerId"],
  additionalProperties: false,
  properties: { offerId: { type: "string", minLength: 1, maxLength: 64 } },
} as const;

/**
 * One-tap rebook for a booking a venue closure cancelled. The offer id is the
 * slot's start instant (`rebookOfferId`). Server-side so the deposit rule
 * cannot be bypassed: a venue that would need a deposit is refused (422) and
 * the guest uses the full widget with its payment step.
 */
export const manageRebookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { offerId: string } }>(
    "/public/v1/reservations/manage/rebook",
    {
      schema: { body: bodySchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    manageTokenScoped(
      { missing: (reply) => reply.status(404).send(reservationNotFoundProblem()) },
      async (request, reply, { venueId, reservation }) => {
        const deps: RebookDeps = {
          ...defaultRebookDeps,
          confirmHold: (input) =>
            fastify.transitions.confirmHold(
              { ...input, actor: guestActor(reservation.guestId) },
              {
                door: "public-hold",
                manageToken: (created) =>
                  created.guestEmail
                    ? generateManageToken(created.id, created.guestEmail)
                    : undefined,
              }
            ),
        };
        const result = await rebookVenueCancelled(
          reservation,
          venueId,
          request.body.offerId,
          new Date(),
          deps
        );

        if (result.ok) {
          const { id, guestEmail } = result.reservation;
          return reply.status(201).send({
            data: { reservationId: id, startTime: result.reservation.startTime },
            manageToken: guestEmail ? generateManageToken(id, guestEmail) : undefined,
          });
        }
        if (result.reason === "rejected") {
          return reply.status(422).send(gateProblem(result.rejection));
        }
        if (result.reason === "deposit-required") {
          return reply
            .status(422)
            .send(
              createProblemDetails(
                422,
                "Deposit Required",
                "This venue takes a deposit for new bookings, so please choose another date and time."
              )
            );
        }
        if (result.reason === "already-rebooked") {
          return reply.status(409).send({
            ...createProblemDetails(
              409,
              "Already Rebooked",
              "This booking has already been rebooked."
            ),
            code: "ALREADY_REBOOKED",
          });
        }
        return reply
          .status(409)
          .send(
            createProblemDetails(
              409,
              "Slot Unavailable",
              "That time is no longer available. Please choose another."
            )
          );
      }
    )
  );
};
