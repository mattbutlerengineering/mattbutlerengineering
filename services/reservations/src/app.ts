import type { FastifyInstance } from "fastify";
import { createServiceApp, type AppOptions } from "@mbe/database";
import type { NotificationDispatcher } from "@mbe/notifications";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/ready.js";
import { tableRoutes } from "./routes/tables.js";
import { reservationRoutes } from "./routes/reservations.js";
import { venueRoutes } from "./routes/venues.js";
import { availabilityRoutes } from "./routes/availability.js";
import { holdRoutes } from "./routes/holds.js";
import { eventRoutes } from "./routes/events.js";
import { floorPlanRoutes } from "./routes/floor-plans.js";
import { guestRoutes } from "./routes/guests.js";
import { publicVenueRoutes } from "./routes/public-venues.js";
import { publicAvailabilityRoutes } from "./routes/public-availability.js";
import { publicHoldRoutes } from "./routes/public-holds.js";
import { publicReservationRoutes } from "./routes/public-reservations.js";
import { publicGuestRecognitionRoutes } from "./routes/public-guest-recognition.js";
import { confirmAttendanceRoutes } from "./routes/confirm-attendance.js";
import { manageReservationRoutes } from "./routes/manage-reservation.js";
import { cancelReservationRoutes } from "./routes/cancel-reservation.js";
import { modifyReservationRoutes } from "./routes/modify-reservation.js";
import { depositRoutes } from "./routes/deposits.js";
import { publicDepositRoutes } from "./routes/public-deposits.js";
import { stripeWebhookRoutes } from "./routes/stripe-webhook.js";
import { waitlistRoutes } from "./routes/waitlist.js";
import { createNotificationPort } from "./notifications.js";
import { createLapsedGuestMonitor } from "./services/lapsed-guest-cron.js";
import { runLapsedGuestScan } from "./services/lapsed-guest-scan.js";
import { emitLapsingGuests } from "./services/events.js";
import { prisma } from "./services/database.js";

export interface ReservationsAppOptions extends AppOptions {
  notificationPort?: NotificationDispatcher;
}

/**
 * Creates the Fastify application instance.
 */
export async function buildApp(options: ReservationsAppOptions = {}): Promise<FastifyInstance> {
  const fastify = await createServiceApp(
    {
      swagger: {
        title: "MBE Reservations API",
        description: "API for managing table reservations and availability",
        serverUrl: "http://localhost:3004",
      },
      registerSchemas,
    },
    options
  );

  // Wire notification port (injected or default Resend-backed)
  const notificationPort = options.notificationPort ?? createNotificationPort();
  fastify.decorate("notificationPort", notificationPort);

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(readinessRoutes);
  await fastify.register(tableRoutes, { prefix: "/api/v1/tables" });
  await fastify.register(reservationRoutes, { prefix: "/api/v1/reservations" });
  await fastify.register(venueRoutes, { prefix: "/api/v1/venues" });
  await fastify.register(availabilityRoutes, {
    prefix: "/api/v1/availability",
  });
  await fastify.register(holdRoutes, { prefix: "/api/v1/holds" });
  await fastify.register(eventRoutes, { prefix: "/api/v1/events" });
  await fastify.register(floorPlanRoutes, { prefix: "/api/v1/floor-plans" });
  await fastify.register(guestRoutes, { prefix: "/api/v1/guests" });
  await fastify.register(waitlistRoutes, { prefix: "/api/v1/waitlist" });

  // Public routes (no auth required)
  await fastify.register(publicVenueRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(publicAvailabilityRoutes, {
    prefix: "/public/v1/venues",
  });
  await fastify.register(publicHoldRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(publicReservationRoutes, {
    prefix: "/public/v1/venues",
  });
  await fastify.register(publicGuestRecognitionRoutes, {
    prefix: "/public/v1/venues",
  });
  await fastify.register(confirmAttendanceRoutes);
  await fastify.register(manageReservationRoutes);
  await fastify.register(cancelReservationRoutes);
  await fastify.register(modifyReservationRoutes);

  // Deposit routes
  await fastify.register(depositRoutes, { prefix: "/api/v1/deposits" });
  await fastify.register(publicDepositRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(stripeWebhookRoutes);

  // Wire lapsed-guest monitor with lifecycle hooks
  const lapsedGuestMonitor = createLapsedGuestMonitor({
    getVenueIds: () =>
      prisma.venue.findMany({ select: { id: true } }).then((vs) => vs.map((v) => v.id)),
    runScan: (venueId) =>
      runLapsedGuestScan(venueId, {
        findGuestsForScan: (vid) =>
          prisma.guest.findMany({
            where: { venueId: vid, visitCount: { gte: 3 }, lastVisit: { not: null } },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              communicationPreference: true,
              reservations: {
                where: { status: "COMPLETED" },
                select: { startTime: true },
                orderBy: { startTime: "asc" },
              },
            },
          }),
        emitLapsingGuests,
      }),
  });
  if (process.env.NODE_ENV !== "test") {
    fastify.addHook("onReady", async () => lapsedGuestMonitor.start(fastify.log));
    fastify.addHook("onClose", async () => lapsedGuestMonitor.stop());
  }

  return fastify;
}

declare module "fastify" {
  interface FastifyInstance {
    notificationPort: NotificationDispatcher;
  }
}
