import { describe, expect, it, vi } from "vitest";
import type * as Engine from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

// Count the engine's resolveDay calls; behaviour stays the real one.
vi.mock("@mbe/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof Engine>();
  return { ...actual, resolveDay: vi.fn(actual.resolveDay) };
});

const { resolveDay } = await import("@mbe/availability");
const { resolveScopeConflicts, SCOPE_CONFLICT_HORIZON_DAYS } =
  await import("./availability-config-plan.js");

const BASE: AvailabilityConfig = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-1",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

/** Forty stored open-ended special-hours rules, one per week. */
const STORED: DateRule[] = Array.from({ length: 40 }, (_, i) => ({
  id: `dr-${i}`,
  kind: "special_hours",
  targetKind: "venue",
  startsOn: `2026-${String(11 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
  endsOn: null,
  payload: { version: 1, services: [] },
}));

describe("resolveScopeConflicts cost (runs inside the save transaction)", () => {
  it("resolves each window date once per config, whatever the rule count", () => {
    const before = { ...BASE, dateRules: STORED };
    const weekEdit = {
      ...before,
      scheduleServices: [{ ...BASE.scheduleServices[0]!, closesAt: 1380 }],
    };
    let n = 0;
    vi.mocked(resolveDay).mockClear();

    const resolved = resolveScopeConflicts(
      before,
      weekEdit,
      "replace",
      () => `s-${++n}`,
      "2026-10-25"
    );

    expect(vi.mocked(resolveDay).mock.calls.length).toBeLessThanOrEqual(
      2 * SCOPE_CONFLICT_HORIZON_DAYS
    );
    expect(resolved.dateRules.filter((r) => r.kind === "skip").length).toBeGreaterThan(40);
  });
});
