import { describe, expect, it } from "vitest";
import { hubActions } from "./hub-actions.js";
import { rowsOf, seasonal, venue } from "./hub-rows-test-helpers.js";

const kinds = (actions: ReturnType<typeof hubActions>) => actions.map((a) => a?.kind ?? null);

describe("hubActions", () => {
  it("gives a Manager one action per row: Edit, and View on closures", () => {
    const rows = rowsOf(venue([], seasonal("summer", "Summer hours", {})));
    expect(kinds(hubActions(rows, true))).toEqual(["edit", "edit", "edit", "view", "edit"]);
  });

  it("reads Add on seasonal hours when none exist, and goes to the new-hours editor", () => {
    const [, seasonalAction] = hubActions(rowsOf(venue()), true);
    expect(seasonalAction).toEqual({
      kind: "add",
      to: "/availability/calendar?tab=schedules&action=addSchedule",
    });
  });

  it("gives a Host only View, on special dates and on closures", () => {
    expect(kinds(hubActions(rowsOf(venue()), false))).toEqual([null, null, "view", "view", null]);
  });

  // Until each view is built its target is the tab of today's page that does the same job.
  // Booking rules (C2.5) and regular hours (E4.4) have their own addresses.
  it("sends every action to a view that is mounted today", () => {
    const rows = rowsOf(venue([], seasonal("summer", "Summer hours", {})));
    expect(hubActions(rows, true).map((a) => a?.to)).toEqual([
      "/availability/hours",
      "/availability/calendar?tab=schedules",
      "/availability/calendar?tab=special",
      "/availability/calendar?tab=special",
      "/availability/booking-rules",
    ]);
  });
});
