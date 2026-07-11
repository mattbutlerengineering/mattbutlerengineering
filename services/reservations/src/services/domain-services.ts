import { availabilityService, type AvailabilityService } from "./availability.js";
import { briefingService, type BriefingService } from "./briefing.js";
import { depositService, type DepositService } from "./deposit.js";
import { floorPlanService, type FloorPlanService } from "./floor-plan.js";
import { guestService, type GuestService } from "./guest.js";
import { holdService, type HoldService } from "./hold.js";
import { reservationService, type ReservationService } from "./reservation.js";
import { stripeService, type StripeService } from "./stripe.js";
import { tableService, type TableService } from "./table.js";
import {
  venueGroupService,
  venueService,
  type VenueGroupService,
  type VenueService,
} from "./venue.js";
import { waitlistService, type WaitlistService } from "./waitlist.js";

/**
 * Domain-services composition seam (issue #3357).
 *
 * Every domain service consumed by a route handler, keyed without the
 * `Service` suffix. buildApp decorates one merged instance of this interface
 * as `fastify.services`; routes resolve services from the decoration instead
 * of importing module singletons.
 *
 * WHY: when routes import singletons directly, *module identity* is the only
 * test seam — every route test must `vi.mock` the full import ring just to
 * register the app, and the mocks drift silently from the real shapes (the
 * old availability ring faked an `estimateDuration` method that no longer
 * exists). With this seam, tests pass fakes through
 * `buildApp({ services: { … } })`; the `Partial` merge means a test injects
 * only the services its routes touch, and `satisfies`-checked fakes fail to
 * compile when a service's shape changes.
 *
 * Scope: object singletons consumed by routes. Free functions routes import
 * (e.g. `confirmHold`, `cancelReservationWithDeposit`, `recognizeGuest`) are
 * separate seams — inject them where they are composed, or fold them into a
 * service here when they grow one.
 *
 * `deposit` and `stripe` are class instances with private fields, so an
 * object-literal of vi.fn()s cannot `satisfies` them. Fake those two by
 * constructing the real class around a fake port (`new DepositService(fakeStripePort)`,
 * the existing deposit.test.ts pattern), or publish structural `Pick<…>` port
 * types at their owning modules when their routes migrate.
 */
export interface DomainServices {
  availability: AvailabilityService;
  briefing: BriefingService;
  deposit: DepositService;
  floorPlan: FloorPlanService;
  guest: GuestService;
  hold: HoldService;
  reservation: ReservationService;
  stripe: StripeService;
  table: TableService;
  venue: VenueService;
  venueGroup: VenueGroupService;
  waitlist: WaitlistService;
}

/**
 * Production wiring: the existing module singletons, unchanged. Loading these
 * modules is side-effect-safe (the Prisma pool and Stripe client are
 * constructed at module load but perform no I/O; nothing connects until first
 * use), so tests that inject fakes never need to mock the modules out of
 * existence.
 */
export function createDefaultDomainServices(): DomainServices {
  return {
    availability: availabilityService,
    briefing: briefingService,
    deposit: depositService,
    floorPlan: floorPlanService,
    guest: guestService,
    hold: holdService,
    reservation: reservationService,
    stripe: stripeService,
    table: tableService,
    venue: venueService,
    venueGroup: venueGroupService,
    waitlist: waitlistService,
  };
}
