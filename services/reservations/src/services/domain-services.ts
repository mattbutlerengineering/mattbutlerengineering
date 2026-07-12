import { availabilityService } from "./availability.js";
import { venueService } from "./venue.js";
import { tableService } from "./table.js";
import { reservationService } from "./reservation.js";
import { guestService } from "./guest.js";
import { floorPlanService } from "./floor-plan.js";
import { holdService } from "./hold.js";
import { depositService } from "./deposit.js";
import { waitlistService } from "./waitlist.js";
import { briefingService } from "./briefing.js";

/**
 * The reservations domain-service seam (issue #3357).
 *
 * Every domain module (`reservationService`, `venueService`, `availabilityService`,
 * ...) is a module-level singleton that imports the Prisma client at module scope.
 * Historically that made *module identity* the de-facto test seam: a route test had
 * to `vi.mock` the full ring of sibling service modules just to register the app.
 *
 * This type collects those singletons behind one injectable record so `buildApp`
 * can decorate the resolved services onto Fastify once. Routes then resolve their
 * dependencies from `fastify.services` instead of importing the singleton directly,
 * and tests inject fakes through `buildApp({ services })` — no `vi.mock` ring needed.
 *
 * The default composition ({@link defaultDomainServices}) is exactly the existing
 * production singletons, so runtime wiring is unchanged.
 *
 * `venueGroupService` is intentionally absent: it is a secondary export of
 * `venue.js` that several not-yet-migrated route tests omit from their partial
 * `vi.mock("../services/venue.js")`. Referencing it in this eager composition
 * would break those mocks. It joins the seam when `venues.ts` migrates.
 */
export interface DomainServices {
  availabilityService: typeof availabilityService;
  venueService: typeof venueService;
  tableService: typeof tableService;
  reservationService: typeof reservationService;
  guestService: typeof guestService;
  floorPlanService: typeof floorPlanService;
  holdService: typeof holdService;
  depositService: typeof depositService;
  waitlistService: typeof waitlistService;
  briefingService: typeof briefingService;
}

/**
 * Production wiring: the existing Prisma-backed module singletons. `buildApp`
 * spreads any `options.services` overrides on top of this, so callers that pass
 * nothing get identical runtime behaviour.
 */
export const defaultDomainServices: DomainServices = {
  availabilityService,
  venueService,
  tableService,
  reservationService,
  guestService,
  floorPlanService,
  holdService,
  depositService,
  waitlistService,
  briefingService,
};
