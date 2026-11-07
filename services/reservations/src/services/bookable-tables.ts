import type { Prisma } from "../generated/prisma/index.js";

/**
 * The single definition of "bookable table" (#8276). A table is bookable when
 * it is active AND its floor plan is the venue's active plan, or it has no
 * plan. Every loader of bookable tables (availability, snapshot, waitlist,
 * the tables list behind the agent tools) builds its `where` from here so the
 * rule cannot drift between them.
 *
 * Safety valve: a venue with NO active plan keeps all its tables bookable,
 * otherwise a venue that never activated a plan would silently lose every
 * online table.
 */
export function onActivePlanWhere(): Prisma.TableWhereInput {
  return {
    OR: [
      { floorPlanId: null },
      { floorPlan: { isActive: true } },
      { venue: { floorPlans: { none: { isActive: true } } } },
    ],
  };
}

export function bookableTableWhere(venueId: string): Prisma.TableWhereInput {
  return { venueId, isActive: true, ...onActivePlanWhere() };
}
