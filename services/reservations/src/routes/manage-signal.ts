import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { canSignal, type GuestSignalKind } from "../services/can-signal.js";
import { countGuestSignals, recordGuestSignal } from "../services/guest-signal.js";

type SignalBody = { kind: GuestSignalKind; minutes?: 5 | 15 | 30 };

const signalBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: { enum: ["running-late", "arrived"] },
    minutes: { enum: [5, 15, 30] },
  },
  if: { properties: { kind: { const: "running-late" } } },
  then: { required: ["minutes"] },
  else: { not: { required: ["minutes"] } },
} as const;

const REFUSALS = {
  "not-confirmed": {
    status: 409,
    title: "Cannot Signal",
    detail: "Only confirmed reservations can send a signal",
  },
  "outside-window": {
    status: 409,
    title: "Cannot Signal",
    detail: "Signals are only accepted around the reservation time",
  },
  "cap-reached": {
    status: 429,
    title: "Too Many Signals",
    detail: "This reservation has sent the maximum number of signals",
  },
} as const;

/**
 * Guest night-of signals ("running late" / "arrived"), authenticated by the
 * manage token. Information only: the reservation row is never changed; the
 * signal is appended to the reservation history.
 */
export const manageSignalRoutes: FastifyPluginAsync = async (fastify) => {
  const { venueService } = fastify.services;
  const { reservationEvents } = fastify;

  fastify.post<{ Body: SignalBody }>(
    "/public/v1/reservations/manage/signal",
    {
      schema: { body: signalBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    manageTokenScoped(
      { missing: (reply) => reply.status(404).send(reservationNotFoundProblem()) },
      async (request, reply, { venueId, reservation }) => {
        const venue = await venueService.getById(venueId);
        if (!venue) return reply.status(404).send(reservationNotFoundProblem());

        const { kind, minutes } = request.body;
        const verdict = canSignal({
          status: reservation.status,
          startTime: reservation.startTime,
          timezone: venue.ianaTimezone,
          now: new Date(),
          kind,
          priorSignals: await countGuestSignals(reservation.id),
        });
        if (!verdict.ok) {
          const r = REFUSALS[verdict.reason];
          return reply.status(r.status).send(createProblemDetails(r.status, r.title, r.detail));
        }

        await recordGuestSignal({
          reservationId: reservation.id,
          venueId,
          guestId: reservation.guestId,
          kind,
          minutes,
        });
        // Only after the signal has persisted; every refusal above returns first.
        reservationEvents.emitGuestSignal(venueId, {
          reservationId: reservation.id,
          kind,
          ...(minutes === undefined
            ? {}
            : {
                minutes,
                eta: new Date(
                  new Date(reservation.startTime).getTime() + minutes * 60_000
                ).toISOString(),
              }),
        });
        return reply.status(200).send({ data: { kind, ...(minutes ? { minutes } : {}) } });
      }
    )
  );
};
