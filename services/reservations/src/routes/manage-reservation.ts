import type { FastifyPluginAsync } from "fastify";
import { serializeManagedReservation } from "../services/serializers.js";
import { loadVenueCancellation } from "../services/manage-rebook.js";
import { countGuestSignals } from "../services/guest-signal.js";
import { nightOfVenueFields } from "../services/night-of-venue.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";
import { generateManageToken } from "./public-reservations.js";

export const manageReservationRoutes: FastifyPluginAsync = async (fastify) => {
  const { venueService } = fastify.services;

  fastify.get<{ Querystring: { token?: string } }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    // ADR-026 §3.3 item 4: the scope verifies the token, resolves the venue
    // and loads the reservation once, inside that venue's RLS context.
    manageTokenScoped(
      { missing: (reply) => reply.status(404).send(reservationNotFoundProblem()) },
      async (_request, reply, { venueId, reservation }) => {
        const venue = await venueService.getById(venueId);
        const loaded = await loadVenueCancellation(reservation, venueId);
        // The new booking belongs to the same guest, so the same email signs its
        // token ("" for a phone-only guest, like the closure notice runtime).
        const venueCancellation = loaded?.rebooked
          ? {
              ...loaded,
              rebooked: {
                startTime: loaded.rebooked.startTime,
                manageToken: generateManageToken(
                  loaded.rebooked.reservationId,
                  reservation.guestEmail ?? ""
                ),
              },
            }
          : loaded;

        return reply.status(200).send({
          data: {
            reservation: serializeManagedReservation(reservation),
            venueCancellation,
            // Only a confirmed booking can signal, so only it pays for the history read.
            guestSignals:
              reservation.status === "CONFIRMED"
                ? await countGuestSignals(reservation.id)
                : { late: 0, arrived: 0 },
            venue: venue
              ? {
                  id: venue.id,
                  name: venue.name,
                  slug: venue.slug,
                  ianaTimezone: venue.ianaTimezone,
                  phone: venue.settings?.phone,
                  modificationCutoffHours: venue.settings?.guestModificationCutoffHours ?? null,
                  maxPartySizeChange: venue.settings?.guestMaxPartySizeChange ?? null,
                  ...nightOfVenueFields(venue.settings),
                  tonightNote: nightOfVenueFields(venue.settings).tonightNote ?? null,
                }
              : null,
          },
        });
      }
    )
  );
};
