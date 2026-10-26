import { describe, expect, it } from "vitest";
import type { AvailabilitySnapshot } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import { moveTarget } from "./closure-command-plan.js";

const DINNER_TO_9PM = {
  id: "sh",
  kind: "special_hours",
  targetKind: "venue",
  startsOn: "2026-12-24",
  endsOn: "2026-12-24",
  payload: {
    version: 1,
    services: [
      {
        venueServiceId: "vs",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1260,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
    ],
  },
} as unknown as DateRule;

const snapshot = (extra: DateRule): AvailabilitySnapshot =>
  ({
    timezone: "UTC",
    config: {
      venueServices: [{ id: "vs", name: "Dinner" }],
      schedules: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [DINNER_TO_9PM, extra],
    },
  }) as unknown as AvailabilitySnapshot;

const booking = { startTime: "2026-12-24T19:45:00.000Z", endTime: "2026-12-24T21:45:00.000Z" };
const NOW = new Date("2026-12-24T18:00:00.000Z");

describe("moveTarget and a Tonight stop window", () => {
  it("only excludes the start minute: a stop window does not block a booking running across it", () => {
    const stop = {
      id: "sw",
      kind: "tonight",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      payload: { version: 1, stop: { from: 1140, to: 1170 } }, // 7:00-7:30 PM
    } as unknown as DateRule;
    const target = moveTarget(snapshot(stop), "2026-12-24", booking, NOW);
    // The nearest start that is not inside the stop window: 6:59 PM, running across it.
    expect(target?.startTime.toISOString()).toBe("2026-12-24T18:59:00.000Z");
    expect(target?.endTime.toISOString()).toBe("2026-12-24T20:59:00.000Z");
  });

  it("still keeps a closure window clear of the whole booking", () => {
    const window = {
      id: "cw",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      window: { version: 1, from: 1140, to: 1170 },
    } as unknown as DateRule;
    const target = moveTarget(snapshot(window), "2026-12-24", booking, NOW);
    expect(target).toBeNull();
  });
});
