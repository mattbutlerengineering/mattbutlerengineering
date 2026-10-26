import { availabilityService } from "./availability.js";
import { availabilityConfigService } from "./availability-config.js";
import { availabilityChangesService } from "./availability-changes.js";
import { closureImpactService } from "./closure-impact-store.js";
import { venueService, venueGroupService } from "./venue.js";
import { tableService } from "./table.js";
import { reservationService } from "./reservation.js";
import { guestService } from "./guest.js";
import { floorPlanService } from "./floor-plan.js";
import { menuService } from "./menu.js";
import { floorPlanSectionService } from "./floor-plan-section.js";
import { holdService } from "./hold.js";
import type { DepositService } from "./deposit.js";
import { waitlistService } from "./waitlist.js";
import { briefingService } from "./briefing.js";
import { venueTeamService } from "./venue-team.js";

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
 * production singletons, so runtime wiring is unchanged — except `depositService`,
 * which `buildApp` constructs over the one payments adapter.
 *
 * Adoption is complete: `routes/domain-services-adoption.test.ts` fails if any
 * route imports one of these singletons at value level.
 */
export interface DomainServices {
  availabilityService: typeof availabilityService;
  availabilityConfigService: typeof availabilityConfigService;
  availabilityChangesService: typeof availabilityChangesService;
  closureImpactService: typeof closureImpactService;
  venueService: typeof venueService;
  venueGroupService: typeof venueGroupService;
  tableService: typeof tableService;
  reservationService: typeof reservationService;
  guestService: typeof guestService;
  floorPlanService: typeof floorPlanService;
  menuService: typeof menuService;
  floorPlanSectionService: typeof floorPlanSectionService;
  holdService: typeof holdService;
  /** Built in `buildApp` over the one payments adapter — never a module singleton. */
  depositService: DepositService;
  waitlistService: typeof waitlistService;
  briefingService: typeof briefingService;
  venueTeamService: typeof venueTeamService;
}

/**
 * Production wiring: the existing Prisma-backed module singletons. `buildApp`
 * spreads any `options.services` overrides on top of this, so callers that pass
 * nothing get identical runtime behaviour.
 */
export const defaultDomainServices: Omit<DomainServices, "depositService"> = {
  availabilityService,
  availabilityConfigService,
  availabilityChangesService,
  closureImpactService,
  venueService,
  venueGroupService,
  tableService,
  reservationService,
  guestService,
  floorPlanService,
  menuService,
  floorPlanSectionService,
  holdService,
  waitlistService,
  briefingService,
  venueTeamService,
};
