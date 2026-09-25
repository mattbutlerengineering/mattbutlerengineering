import type { FastifyInstance } from "fastify";
import { createServiceApp, registerReadinessRoutes, type AppOptions } from "@mbe/service-bootstrap";
import type { NotificationDispatcher } from "@mbe/notifications";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
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
import { publicGuestRiskRoutes } from "./routes/public-guest-risk.js";
import { publicWaitlistRoutes } from "./routes/public-waitlist.js";
import { confirmAttendanceRoutes } from "./routes/confirm-attendance.js";
import { manageReservationRoutes } from "./routes/manage-reservation.js";
import { cancelReservationRoutes } from "./routes/cancel-reservation.js";
import { modifyReservationRoutes } from "./routes/modify-reservation.js";
import { depositRoutes } from "./routes/deposits.js";
import { publicDepositRoutes } from "./routes/public-deposits.js";
import { stripeWebhookRoutes, setStripeWebhookLogger } from "./routes/stripe-webhook.js";
import { waitlistRoutes } from "./routes/waitlist.js";
import { publicUnsubscribeRoutes } from "./routes/public-unsubscribe.js";
import { briefingRoutes } from "./routes/briefing.js";
import { bookingMetricsRoutes } from "./routes/booking-metrics.js";
import { createNotificationPort } from "./notifications.js";
import {
  createDefaultBookingNotifier,
  type BookingNotifier,
} from "./services/booking-notifications.js";
import {
  createDefaultWaitlistNotifier,
  type WaitlistNotifier,
} from "./services/waitlist-notifier.js";
import {
  createDefaultPostVisitNotifier,
  type PostVisitNotifier,
} from "./services/post-visit-notifier.js";
import { createNotifierRuntime } from "./services/notifier-runtime.js";
import { createLapsedGuestMonitor } from "./services/lapsed-guest-cron.js";
import { createReservationJobHandlers, createReservationJobWorker } from "./services/job-worker.js";
import { defaultDomainServices, type DomainServices } from "./services/domain-services.js";
import { generateManageToken } from "./routes/public-reservations.js";
import { db, prisma } from "./services/database.js";
import {
  createHasAnyVenueMembership,
  createVenueMembershipLookup,
} from "./services/venue-membership.js";
import type {
  HasAnyVenueMembership,
  VenueIdResolver,
  VenueMembershipLookup,
} from "@mbe/auth/fastify";
import { getStripeConfig } from "./config/stripe.js";
import { getManageTokenConfig } from "./config/manage-token.js";
import { ReservationEventEmitter } from "./services/events.js";
import { venueContextPreHandler } from "./middleware/venue-context.js";
import { venueIdFromBody, venueIdFromParams, venueIdFromQuery } from "./routes/venue-access.js";
import { setRlsTripwireLogger } from "./services/rls-context-mode.js";
import { setDepositServiceLogger } from "./services/deposit.js";

/**
 * Best-effort venue-id resolution for the global venue-context preHandler
 * (ADR-026 part 6/7): tries the same conventions every route's own
 * `requireVenueAccess` resolver already uses — query, then body, then route
 * params — so `app.venue_id` gets set without every route file wiring a
 * resolver a second time. Routes addressed by another entity's id (e.g. a
 * table/reservation id) resolve to null here, which is the ADR-026 §4
 * default-deny no-op, not a regression — nothing sets `app.venue_id` for
 * those routes today either.
 *
 * Deliberately synchronous, not `async`: `venueIdFromQuery`/`venueIdFromBody`/
 * `venueIdFromParams` (`./routes/venue-access.ts`) are all synchronous, and
 * `venueContextPreHandler` (`./middleware/venue-context.ts`) requires a
 * synchronous result here to call `enterVenueContext` synchronously — see
 * its doc comment for the measured AsyncLocalStorage timing bug an
 * `await`-then-`enterVenueContext` sequence reproduces in this exact app.
 */
const resolveGlobalVenueId: VenueIdResolver = (request) =>
  venueIdFromQuery(request) ?? venueIdFromBody(request) ?? venueIdFromParams(request) ?? null;

export interface ReservationsAppOptions extends AppOptions {
  notificationPort?: NotificationDispatcher;
  bookingNotifier?: BookingNotifier;
  postVisitNotifier?: PostVisitNotifier;
  reservationEvents?: ReservationEventEmitter;
  waitlistNotifier?: WaitlistNotifier;
  venueMembershipLookup?: VenueMembershipLookup;
  hasAnyVenueMembership?: HasAnyVenueMembership;
  /**
   * Domain-service overrides (issue #3357). Defaults to the production Prisma-backed
   * singletons ({@link defaultDomainServices}); tests inject fakes here instead of
   * `vi.mock`-ing the sibling service modules. Routes resolve their services from the
   * `fastify.services` decoration, so an override here is the single seam.
   */
  services?: Partial<DomainServices>;
}

/**
 * Creates the Fastify application instance.
 */
export async function buildApp(options: ReservationsAppOptions = {}): Promise<FastifyInstance> {
  // Validate Stripe secrets at startup — warns (does not throw) if missing so an
  // unconfigured optional deposits feature never takes down the whole service.
  // The webhook route fails closed (503) without a real signing secret.
  getStripeConfig({
    nodeEnv: process.env.NODE_ENV,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  // Validate manage-token HMAC secret at startup — throws in production if missing.
  // In test/dev, warns but continues to allow local development without real tokens.
  getManageTokenConfig({
    nodeEnv: process.env.NODE_ENV,
    secret: process.env.MANAGE_TOKEN_SECRET,
  });

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

  // ADR-026 §3.3 / #5369 PR 1: wire the app's real logger into the
  // unscoped-RLS-query tripwire, so its default `"warn"` mode produces real
  // shadow telemetry in production rather than logging into the module's
  // no-op default (see `services/rls-context-mode.ts`).
  setRlsTripwireLogger(fastify.log);

  // #5722 M1/M3: wire the app's real logger into DepositService's
  // reconciliation logging (ambiguous capture statuses, lost CAS races on
  // rollback/write-off), and into the Stripe webhook's charge.refunded
  // handler, rather than the modules' no-op defaults.
  setDepositServiceLogger(fastify.log);
  setStripeWebhookLogger(fastify.log);

  // Wire notification port (injected or default Resend-backed)
  const notificationPort = options.notificationPort ?? createNotificationPort();
  fastify.decorate("notificationPort", notificationPort);

  // Single owner of the notifier infrastructure (issue #3088): reads env
  // (Twilio, REDIS_URL) once and hands the notifiers + worker a typed,
  // lazily-connected scheduler. Construction opens no Redis connection, so
  // buildApp() stays side-effect-free.
  const notifierRuntime = createNotifierRuntime();

  // Wire booking notifier — shares the same NotificationDispatcher, no second Resend client
  const bookingNotifier =
    options.bookingNotifier ??
    createDefaultBookingNotifier(notificationPort, notifierRuntime, fastify.log);
  fastify.decorate("bookingNotifier", bookingNotifier);

  // Wire post-visit notifier — injectable for testing, default Resend-backed for production
  const postVisitNotifier =
    options.postVisitNotifier ?? createDefaultPostVisitNotifier(notificationPort);
  fastify.decorate("postVisitNotifier", postVisitNotifier);

  // Wire waitlist notifier — injectable for testing, default env-backed for production
  const waitlistNotifier =
    options.waitlistNotifier ?? createDefaultWaitlistNotifier(notifierRuntime);
  fastify.decorate("waitlistNotifier", waitlistNotifier);

  // Wire reservation events emitter — injectable for testing, default singleton for production
  const reservationEvents = options.reservationEvents ?? new ReservationEventEmitter();
  fastify.decorate("reservationEvents", reservationEvents);

  // Wire venue-membership lookup (ADR-020) — injectable for testing, default
  // Prisma-backed for production. requireVenueAccess consults it per request so
  // a revoked membership denies access immediately. Decorated before route
  // registration so child route plugins inherit it.
  const venueMembershipLookup =
    options.venueMembershipLookup ?? createVenueMembershipLookup(prisma);
  fastify.decorate("venueMembershipLookup", venueMembershipLookup);

  // Wire the "holds any venue membership" lookup (ADR-020, third case) —
  // injectable for testing, Prisma-backed for production.
  // requireVenueCreateAccess consults it to recognise the first-venue
  // bootstrap. Decorated before route registration so child route plugins
  // inherit it.
  const hasAnyVenueMembership =
    options.hasAnyVenueMembership ?? createHasAnyVenueMembership(prisma);
  fastify.decorate("hasAnyVenueMembership", hasAnyVenueMembership);

  // Wire the domain-service seam (issue #3357) — resolve the injectable services
  // once (production singletons by default, test fakes via options.services) and
  // decorate them so route plugins resolve dependencies from `fastify.services`
  // instead of importing the sibling singleton at module scope. Decorated before
  // route registration so child route plugins inherit it.
  const services: DomainServices = { ...defaultDomainServices, ...options.services };
  fastify.decorate("services", services);

  // Disconnect the Prisma/pg pool once fastify has drained in-flight requests
  // (#5469). `@mbe/database`'s createDatabase() registers its own
  // `process.on("beforeExit", shutdown)`, but startServiceServer's SIGTERM/
  // SIGINT handler always ends with an explicit `process.exit(0)` — which
  // never fires `beforeExit` — so the pool was previously torn down by abrupt
  // process termination on every deploy instead of a graceful disconnect.
  // fastify's own `onClose` hook (already used for lapsedGuestMonitor/
  // jobWorker below) runs deterministically after requests drain, so wire
  // db.shutdown() here instead. Registered unconditionally (not gated on
  // NODE_ENV !== "test" like the background jobs below) since it has no
  // observable side effect beyond closing a connection that tests mock out.
  fastify.addHook("onClose", async () => db.shutdown());

  // Postgres RLS venue-scoping backstop (ADR-026 part 6/7): set the
  // `app.venue_id` session variable for every request whose venue is
  // resolvable from its own query/body/params, so the RLS policies already
  // enabled on floor_plans/tables/guests/reservations/deposits/waitlist_entries
  // (parts 2-4) see the same venue scope the application layer does.
  //
  // Registered as a shared `addHook`, which Fastify always runs BEFORE a
  // route's own `preHandler` option array — so this necessarily runs before
  // `requireAuth`/`requireVenueAccess`, not after, despite those guards
  // being the more familiar "runs first" preHandlers. That ordering is safe:
  // this hook never makes an authorization decision (it can only narrow
  // which rows are visible, exactly like the app-level `where: { venueId }`
  // filters it backstops) and `requireVenueAccess` still independently
  // 403s a non-member on every route that has it, after this hook runs. A
  // request with no resolvable venue id (public routes, health checks,
  // entity-addressed routes) is a deliberate no-op — ADR-026 §4 default-deny.
  fastify.addHook("preHandler", venueContextPreHandler(resolveGlobalVenueId));

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(registerReadinessRoutes, { prisma });
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
  await fastify.register(briefingRoutes, { prefix: "/api/v1/briefing" });
  await fastify.register(bookingMetricsRoutes, { prefix: "/api/v1/reservations/metrics" });

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
  await fastify.register(publicGuestRiskRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(publicWaitlistRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(confirmAttendanceRoutes);
  await fastify.register(manageReservationRoutes);
  await fastify.register(cancelReservationRoutes);
  await fastify.register(modifyReservationRoutes);
  await fastify.register(publicUnsubscribeRoutes);

  // Deposit routes
  await fastify.register(depositRoutes, { prefix: "/api/v1/deposits" });
  await fastify.register(publicDepositRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(stripeWebhookRoutes);

  // Wire lapsed-guest monitor with lifecycle hooks
  const lapsedGuestMonitor = createLapsedGuestMonitor({ prisma });

  if (process.env.NODE_ENV !== "test") {
    fastify.addHook("onReady", async () => lapsedGuestMonitor.start(fastify.log));
    fastify.addHook("onClose", async () => lapsedGuestMonitor.stop());

    // Wire the in-process job worker (issue #3078 / ADR-019): dequeues the
    // BOOKING_REMINDER / DAY_OF_REMINDER / WAITLIST_EXPIRY jobs enqueued via
    // the JobScheduler and delivers them through the notification dispatcher +
    // waitlist re-notify path. Handlers are built eagerly (pure closures);
    // worker construction — which opens the Redis consumer — is deferred to
    // onReady so buildApp() stays side-effect-free.
    //
    // notifierRuntime.redisUrl is null when NODE_ENV=production and REDIS_URL
    // is unset (#4172) — starting the worker against a bogus URL would
    // silently fail to consume anything, so skip it entirely instead.
    if (notifierRuntime.redisUrl) {
      const jobWorker = createReservationJobWorker({
        redisUrl: notifierRuntime.redisUrl,
        handlers: createReservationJobHandlers({
          getReservation: (id) => services.reservationService.getById(id),
          getVenue: (id) => services.venueService.getById(id),
          dispatcher: notificationPort,
          generateManageToken,
          handleWaitlistExpiry: (input) => waitlistNotifier.handleExpiry(input),
          logger: fastify.log,
        }),
      });
      fastify.addHook("onReady", async () => jobWorker.start(fastify.log));
      fastify.addHook("onClose", async () => jobWorker.stop());
    }
  }

  // AppError serialization is handled centrally by errorHandlerPlugin →
  // classifyError (in @mbe/service-bootstrap), which emits the AppError `code`
  // as an RFC 9457 extension member. No per-service error handler is needed.

  return fastify;
}

declare module "fastify" {
  interface FastifyInstance {
    notificationPort: NotificationDispatcher;
    bookingNotifier: BookingNotifier;
    waitlistNotifier: WaitlistNotifier;
    postVisitNotifier: PostVisitNotifier;
    reservationEvents: ReservationEventEmitter;
    venueMembershipLookup: VenueMembershipLookup;
    hasAnyVenueMembership: HasAnyVenueMembership;
    /** Resolved domain-service seam (issue #3357) — see {@link DomainServices}. */
    services: DomainServices;
  }
}
