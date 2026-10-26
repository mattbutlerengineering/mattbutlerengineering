import type { FastifyInstance } from "fastify";
import { createServiceApp, type AppOptions } from "@mbe/service-bootstrap";
import type { NotificationDispatcher } from "./notifications/index.js";
import { registerSchemas } from "./schemas/index.js";
import { tableRoutes } from "./routes/tables.js";
import { reservationRoutes } from "./routes/reservations.js";
import { venueRoutes } from "./routes/venues.js";
import { venueTeamRoutes } from "./routes/venue-team.js";
import { availabilityConfigRoutes } from "./routes/availability-config.js";
import { closureRoutes } from "./routes/closures.js";
import { AVAILABILITY_CONFIG_PREFIX } from "@mbe/types";
import { availabilityRoutes } from "./routes/availability.js";
import { holdRoutes } from "./routes/holds.js";
import { eventRoutes } from "./routes/events.js";
import { floorPlanRoutes } from "./routes/floor-plans.js";
import { menuRoutes } from "./routes/menus.js";
import { floorPlanSectionRoutes } from "./routes/floor-plan-sections.js";
import { guestRoutes } from "./routes/guests.js";
import { publicVenueRoutes } from "./routes/public-venues.js";
import { publicMenuRoutes } from "./routes/public-menus.js";
import { publicAvailabilityRoutes } from "./routes/public-availability.js";
import { publicHoldRoutes } from "./routes/public-holds.js";
import { publicReservationRoutes } from "./routes/public-reservations.js";
import { publicGuestRecognitionRoutes } from "./routes/public-guest-recognition.js";
import { publicGuestRiskRoutes } from "./routes/public-guest-risk.js";
import { publicWaitlistRoutes } from "./routes/public-waitlist.js";
import { confirmAttendanceRoutes } from "./routes/confirm-attendance.js";
import { manageReservationRoutes } from "./routes/manage-reservation.js";
import { manageRebookRoutes } from "./routes/manage-rebook.js";
import { cancelReservationRoutes } from "./routes/cancel-reservation.js";
import { modifyReservationRoutes } from "./routes/modify-reservation.js";
import { depositRoutes } from "./routes/deposits.js";
import { publicDepositRoutes } from "./routes/public-deposits.js";
import { stripeWebhookRoutes, setStripeWebhookLogger } from "./routes/stripe-webhook.js";
import { waitlistRoutes } from "./routes/waitlist.js";
import { publicUnsubscribeRoutes } from "./routes/public-unsubscribe.js";
import { briefingRoutes } from "./routes/briefing.js";
import { bookingMetricsRoutes } from "./routes/booking-metrics.js";
import { reservationEventRoutes } from "./routes/reservation-events.js";
import { createNotificationPort } from "./notifications.js";
import {
  createDefaultWaitlistNotifier,
  type WaitlistNotifier,
} from "./services/waitlist-notifier.js";
import { createDefaultPostVisitNotifier } from "./services/post-visit-notifier.js";
import { createNotifierRuntime } from "./services/notifier-runtime.js";
import { createLapsedGuestMonitor } from "./services/lapsed-guest-cron.js";
import { createReservationJobHandlers, createReservationJobWorker } from "./services/job-worker.js";
import {
  createClosureRefunds,
  runClosureRefundJob,
  type ClosureRefunds,
} from "./services/closure-refund.js";
import { createPrismaClosureRefundStore } from "./services/closure-refund-store.js";
import { defaultDomainServices, type DomainServices } from "./services/domain-services.js";
import { generateManageToken } from "./routes/public-reservations.js";
import { db, prisma } from "./services/database.js";
import { venueScopeOf } from "./routes/venue-scope.js";
import {
  createHasAnyVenueMembership,
  createVenueMembershipLookup,
  createVenueRoleLookup,
} from "./services/venue-membership.js";
import type {
  HasAnyVenueMembership,
  VenueMembershipLookup,
  VenueRoleLookup,
} from "@mbe/auth/fastify";
import { getStripeConfig } from "./config/stripe.js";
import { getManageTokenConfig } from "./config/manage-token.js";
import { ReservationEventEmitter } from "./services/events.js";
import { setRlsTripwireLogger } from "./services/rls-context-mode.js";
import { setDepositServiceLogger } from "./services/deposit.js";
import { createReservationTransitions, type ReservationTransitions } from "./transitions/index.js";
import { createDispatcherMessaging } from "./transitions/adapters/dispatcher-messaging.js";
import { createEmitterEvents } from "./transitions/adapters/emitter-events.js";
import { allOutboundLive } from "./transitions/venue-policy.js";
import type { JobsPort, PaymentsPort } from "./transitions/ports.js";
import { StripeService } from "./services/stripe.js";
import { DepositService } from "./services/deposit.js";

export interface ReservationsAppOptions extends AppOptions {
  notificationPort?: NotificationDispatcher;
  /**
   * Reminder-job scheduler the reservation transitions use. Defaults to the
   * notifier runtime's lazily connected scheduler; tests inject a recorder.
   */
  jobs?: JobsPort;
  /**
   * Stripe operations. Defaults to one `StripeService` built here from
   * `STRIPE_SECRET_KEY`; tests inject `createInMemoryPayments`.
   */
  payments?: PaymentsPort;
  /** Closure refund enqueue/retry. Defaults to the Prisma store over the job scheduler. */
  closureRefunds?: ClosureRefunds;
  reservationEvents?: ReservationEventEmitter;
  waitlistNotifier?: WaitlistNotifier;
  venueMembershipLookup?: VenueMembershipLookup;
  venueRoleLookup?: VenueRoleLookup;
  hasAnyVenueMembership?: HasAnyVenueMembership;
  /**
   * Domain-service overrides (issue #3357). Defaults to the production Prisma-backed
   * singletons ({@link defaultDomainServices}); tests inject fakes here instead of
   * `vi.mock`-ing the sibling service modules. Routes resolve their services from the
   * `fastify.services` decoration, so an override here is the single seam.
   */
  services?: Partial<DomainServices>;
}

/** A view of `map` with no mutators, so callers cannot rewrite the registry. */
function readOnlyView<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
  const view: ReadonlyMap<K, V> = {
    get size() {
      return map.size;
    },
    get: (key) => map.get(key),
    has: (key) => map.has(key),
    keys: () => map.keys(),
    values: () => map.values(),
    entries: () => map.entries(),
    forEach: (callback, thisArg) =>
      map.forEach((value, key) => callback.call(thisArg, value, key, view)),
    [Symbol.iterator]: () => map[Symbol.iterator](),
  };
  return view;
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
      database: {
        db,
        healthRoutes: [
          { path: "/health", operationId: "getHealth" },
          { path: "/api/health", operationId: "getHealthApi" },
          { path: "/api/v1/reservations/health", operationId: "getHealthApiReservations" },
        ],
      },
    },
    options
  );

  // Venue-scope registry (docs/fixes/venue-scoped-routes/architecture.md):
  // records every route's `venueScoped` descriptor, or null, keyed
  // "METHOD /url" (trailing slash stripped, as the RLS sweep keys routes).
  // Installed before the first route plugin registers, so child plugins
  // inherit the hook; routes/venue-scope-coverage.test.ts reads it with no
  // database.
  const venueScopes = new Map<string, string | null>();
  fastify.addHook("onRoute", (route) => {
    const url =
      route.url.length > 1 && route.url.endsWith("/") ? route.url.slice(0, -1) : route.url;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      venueScopes.set(`${method} ${url}`, venueScopeOf(route.handler));
    }
  });
  fastify.decorate("venueScopes", readOnlyView(venueScopes));

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

  // Wire waitlist notifier — injectable for testing, default env-backed for production
  const waitlistNotifier =
    options.waitlistNotifier ?? createDefaultWaitlistNotifier(notifierRuntime);
  fastify.decorate("waitlistNotifier", waitlistNotifier);

  // Wire the live reservation events emitter — the single instance SSE clients
  // subscribe to (routes/events.ts); injectable for testing
  const reservationEvents = options.reservationEvents ?? new ReservationEventEmitter();
  fastify.decorate("reservationEvents", reservationEvents);

  // Wire venue-membership lookup (ADR-020) — injectable for testing, default
  // Prisma-backed for production. requireVenueAccess consults it per request so
  // a revoked membership denies access immediately. Decorated before route
  // registration so child route plugins inherit it.
  const venueMembershipLookup =
    options.venueMembershipLookup ?? createVenueMembershipLookup(prisma);
  fastify.decorate("venueMembershipLookup", venueMembershipLookup);

  // Wire the venue-role lookup (requireVenueRole) the same way: per request,
  // so a demotion from manager takes effect on the next call.
  const venueRoleLookup = options.venueRoleLookup ?? createVenueRoleLookup(prisma);
  fastify.decorate("venueRoleLookup", venueRoleLookup);

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
  // instead of importing the sibling singleton at module scope. Adoption is
  // complete and `routes/domain-services-adoption.test.ts` enforces it. Decorated
  // before route registration so child route plugins inherit it.
  //
  // Payments are constructed exactly once, here: one StripeService (same env
  // name and placeholder fallback as before; getStripeConfig above still
  // validates it) unless a test injects `options.payments`, and one
  // DepositService over it.
  const payments: PaymentsPort =
    options.payments ?? new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
  fastify.decorate("payments", payments);
  const services: DomainServices = {
    ...defaultDomainServices,
    ...options.services,
    depositService: options.services?.depositService ?? new DepositService(payments),
  };
  fastify.decorate("services", services);

  // Wire the reservation transitions (maintenance:reservation-transition-effects):
  // the one module that decides what a transition sets off. Every effect
  // adapter is constructed exactly once, here — messaging over the single
  // NotificationDispatcher, jobs over the notifier runtime's scheduler (or an
  // injected one), events over the single live emitter — and the venue effect
  // policy source is chosen in this one place. Decorated before route
  // registration so child route plugins inherit it.
  const transitions = createReservationTransitions({
    ports: {
      messaging: createDispatcherMessaging({
        dispatcher: notificationPort,
        postVisitNotifier: createDefaultPostVisitNotifier(notificationPort),
        getVenue: (venueId) => services.venueService.getById(venueId),
        logger: fastify.log,
      }),
      jobs: options.jobs ?? notifierRuntime.scheduler,
      events: createEmitterEvents(reservationEvents),
    },
    policy: allOutboundLive,
    reservationService: services.reservationService,
    deposits: services.depositService,
    logger: fastify.log,
  });
  fastify.decorate("transitions", transitions);

  // CLOSURE_REFUND (#7524): the closure route enqueues after commit; the worker
  // below settles each deposit through DepositService.
  const closureRefundStore = createPrismaClosureRefundStore();
  fastify.decorate(
    "closureRefunds",
    options.closureRefunds ??
      createClosureRefunds({
        store: closureRefundStore,
        jobs: options.jobs ?? notifierRuntime.scheduler,
      })
  );

  // Register routes
  await fastify.register(tableRoutes, { prefix: "/api/v1/tables" });
  await fastify.register(reservationRoutes, { prefix: "/api/v1/reservations" });
  await fastify.register(reservationEventRoutes, { prefix: "/api/v1/reservations" });
  const venuesPrefix = "/api/v1/venues";
  await fastify.register(venueRoutes, { prefix: venuesPrefix });
  await fastify.register(venueTeamRoutes, { prefix: venuesPrefix });
  await fastify.register(availabilityConfigRoutes, { prefix: AVAILABILITY_CONFIG_PREFIX });
  await fastify.register(closureRoutes, { prefix: AVAILABILITY_CONFIG_PREFIX });
  await fastify.register(availabilityRoutes, {
    prefix: "/api/v1/availability",
  });
  await fastify.register(holdRoutes, { prefix: "/api/v1/holds" });
  await fastify.register(eventRoutes, { prefix: "/api/v1/events" });
  await fastify.register(floorPlanRoutes, { prefix: "/api/v1/floor-plans" });
  await fastify.register(floorPlanSectionRoutes, { prefix: "/api/v1/floor-plan-sections" });
  await fastify.register(menuRoutes, { prefix: "/api/v1/menus" });
  await fastify.register(guestRoutes, { prefix: "/api/v1/guests" });
  await fastify.register(waitlistRoutes, { prefix: "/api/v1/waitlist" });
  await fastify.register(briefingRoutes, { prefix: "/api/v1/briefing" });
  await fastify.register(bookingMetricsRoutes, { prefix: "/api/v1/reservations/metrics" });

  // Public routes (no auth required)
  await fastify.register(publicVenueRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(publicMenuRoutes, { prefix: "/public/v1/venues" });
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
  await fastify.register(manageRebookRoutes);
  await fastify.register(cancelReservationRoutes);
  await fastify.register(modifyReservationRoutes);
  await fastify.register(publicUnsubscribeRoutes);

  // Deposit routes
  await fastify.register(depositRoutes, { prefix: "/api/v1/deposits" });
  await fastify.register(publicDepositRoutes, { prefix: "/public/v1/venues" });
  await fastify.register(stripeWebhookRoutes);

  // Wire lapsed-guest monitor with lifecycle hooks
  const lapsedGuestMonitor = createLapsedGuestMonitor({
    prisma,
    emitLapsingGuests: (venueId, guests) => reservationEvents.emitLapsingGuests(venueId, guests),
  });

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
          runClosureRefund: (payload, opts) =>
            runClosureRefundJob(
              { deposits: services.depositService, payments, store: closureRefundStore },
              payload,
              opts
            ),
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
    waitlistNotifier: WaitlistNotifier;
    reservationEvents: ReservationEventEmitter;
    /** Stripe operations — the one StripeService (or an injected fake). */
    payments: PaymentsPort;
    /** Reservation transitions — one verb per transition, effects planned in one table. */
    transitions: ReservationTransitions;
    /** Enqueues/retries a closure's refund jobs (services/closure-refund.ts). */
    closureRefunds: ClosureRefunds;
    venueMembershipLookup: VenueMembershipLookup;
    venueRoleLookup: VenueRoleLookup;
    hasAnyVenueMembership: HasAnyVenueMembership;
    /** Resolved domain-service seam (issue #3357) — see {@link DomainServices}. */
    services: DomainServices;
    /** Every route's `venueScoped` descriptor, or null (see `venueScopeOf`). */
    venueScopes: ReadonlyMap<string, string | null>;
  }
}
