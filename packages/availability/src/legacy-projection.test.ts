import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { projectLegacyOperatingHours } from "./legacy-projection.js";

const service = (id: string, scheduleId: string, venueServiceId: string, opensAt: number) => ({
  id,
  scheduleId,
  venueServiceId,
  opensAt,
  lastSeatingAt: opensAt + 120,
  closesAt: opensAt + 180,
  seating: { version: 1 as const, interval: 15 },
  bookingTypes: ["online" as const, "phone" as const],
});

const CONFIG: AvailabilityConfig = {
  schedules: [
    {
      id: "sch-old",
      name: "Old",
      kind: "regular",
      isRegular: false,
      archivedAt: "2026-10-01T00:00:00.000Z",
    },
    { id: "sch-new", name: "New", kind: "regular", isRegular: true },
  ],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0, archivedAt: "2026-10-01T00:00:00.000Z" },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [
    service("ss-old", "sch-old", "vs-dinner", 600),
    service("ss-lunch", "sch-new", "vs-lunch", 660),
    service("ss-dinner", "sch-new", "vs-dinner", 1020),
  ],
  assignments: [
    // The archived schedule would win on precedence if it were still read.
    { id: "as-old", scheduleId: "sch-old", weekdays: [5], precedence: 9 },
    { id: "as-new", scheduleId: "sch-new", weekdays: [5], precedence: 0 },
  ],
  dateRules: [],
};

describe("projectLegacyOperatingHours with archived rows", () => {
  it("ignores archived schedules and archived venue services", () => {
    expect(projectLegacyOperatingHours(CONFIG).friday).toEqual({ open: "17:00", close: "20:00" });
  });

  it("reads a day closed when its only schedule is archived", () => {
    const onlyOld = { ...CONFIG, assignments: [CONFIG.assignments[0]!] };
    expect(projectLegacyOperatingHours(onlyOld).friday).toMatchObject({ closed: true });
  });
});
