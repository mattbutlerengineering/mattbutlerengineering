import { describe, it, expect } from "vitest";
import { bookableTableWhere, onActivePlanWhere } from "./bookable-tables.js";

describe("onActivePlanWhere", () => {
  it("admits plan-less tables, tables on the active plan, and any table when the venue has no active plan", () => {
    expect(onActivePlanWhere()).toEqual({
      OR: [
        { floorPlanId: null },
        { floorPlan: { isActive: true } },
        { venue: { floorPlans: { none: { isActive: true } } } },
      ],
    });
  });
});

describe("bookableTableWhere", () => {
  it("requires the venue, an active table, and the active-plan rule", () => {
    expect(bookableTableWhere("venue-1")).toEqual({
      venueId: "venue-1",
      isActive: true,
      ...onActivePlanWhere(),
    });
  });
});
