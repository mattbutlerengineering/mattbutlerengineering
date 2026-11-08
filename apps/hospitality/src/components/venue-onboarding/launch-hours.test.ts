import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, ScheduleService } from "@mbe/types";
import { draftService } from "../availability/quick-setup-demo.fixture.js";
import { launchHoursChanges } from "./launch-hours.js";

const row = (id: string, venueServiceId: string): ScheduleService => ({
  id,
  scheduleId: "legacy-schedule",
  venueServiceId,
  opensAt: 17 * 60,
  lastSeatingAt: 20 * 60 + 30,
  closesAt: 22 * 60,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
  weekdays: [],
  dayHours: { version: 1, sets: [] },
});

/** Two windows a day read from legacy hours: "Service 1" and "Service 2", last seating 90 min before close. */
const derived: AvailabilityConfig = {
  schedules: [{ id: "legacy-schedule", name: "Regular week", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "legacy-s1", name: "Service 1", position: 0 },
    { id: "legacy-s2", name: "Service 2", position: 1 },
  ],
  scheduleServices: [row("legacy-r1", "legacy-s1"), row("legacy-r2", "legacy-s2")],
  assignments: [
    { id: "legacy-a1", scheduleId: "legacy-schedule", weekdays: [1, 2, 3, 4, 5], precedence: 0 },
  ],
  dateRules: [],
};

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe("launchHoursChanges", () => {
  it("replaces the derived week's rows with the typed services, keeping each one's last seating", () => {
    const draft = {
      days: [1, 2, 3, 4, 5],
      services: [
        draftService("a", "Lunch", ["11:30", "14:00", "15:00"]),
        draftService("b", "Dinner", ["17:00", "21:15", "22:00"]),
      ],
    };

    const changes = launchHoursChanges(draft, derived, ids());

    expect(changes.upsert.schedules?.map((s) => s.id)).toEqual(["legacy-schedule"]);
    expect(changes.upsert.venueServices?.map((s) => s.name)).toEqual(["Lunch", "Dinner"]);
    expect(
      changes.upsert.scheduleServices?.map((s) => [s.opensAt, s.lastSeatingAt, s.closesAt])
    ).toEqual([
      [11 * 60 + 30, 14 * 60, 15 * 60],
      [17 * 60, 21 * 60 + 15, 22 * 60],
    ]);
    expect(changes.remove.scheduleServices).toEqual(["legacy-r1", "legacy-r2"]);
    expect(changes.remove.assignments).toEqual(["legacy-a1"]);
  });

  it("removes a derived service the draft does not name and reuses one it does", () => {
    const draft = {
      days: [1, 2, 3, 4, 5],
      services: [draftService("a", "Service 2", ["17:00", "21:15", "22:00"])],
    };

    const changes = launchHoursChanges(draft, derived, ids());

    expect(changes.upsert.venueServices).toEqual([]);
    expect(changes.upsert.scheduleServices?.map((s) => s.venueServiceId)).toEqual(["legacy-s2"]);
    expect(changes.remove.venueServices).toEqual(["legacy-s1"]);
  });
});
