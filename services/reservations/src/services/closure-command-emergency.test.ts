import { describe, expect, it } from "vitest";
import type { AvailabilitySnapshot } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import { isEmergencyTonightClose } from "./closure-command-plan.js";

const DEFAULT_HOURS = { opensAt: 1020, lastSeatingAt: 1320, closesAt: 1380 };

const dinner = (hours: typeof DEFAULT_HOURS): DateRule =>
  ({
    id: "sh",
    kind: "special_hours",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    payload: {
      version: 1,
      services: [
        {
          ...hours,
          venueServiceId: "vs",
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online"],
        },
      ],
    },
  }) as unknown as DateRule;

const tonight = (id: string, payload: object): DateRule =>
  ({
    id,
    kind: "tonight",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    payload: { version: 1, ...payload },
  }) as unknown as DateRule;

const at = (hhmm: string) => new Date(`2026-12-24T${hhmm}:00.000Z`);

function check(
  rule: DateRule,
  now: Date,
  opts: { stored?: DateRule[]; hours?: typeof DEFAULT_HOURS } = {}
): boolean {
  const snapshot = {
    timezone: "UTC",
    config: {
      venueServices: [{ id: "vs", name: "Dinner" }],
      schedules: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [dinner(opts.hours ?? DEFAULT_HOURS), ...(opts.stored ?? [])],
    },
  } as unknown as AvailabilitySnapshot;
  return isEmergencyTonightClose(snapshot, rule, now);
}

describe("isEmergencyTonightClose (#7687)", () => {
  it("treats a short close-early before opening as the emergency close", () => {
    expect(check(tonight("n", { closeAt: 1035 }), at("16:00"))).toBe(true);
    expect(check(tonight("n", { closeAt: 1260 }), at("16:00"))).toBe(false);
  });

  it("allows a mid-service partial close-early and stop", () => {
    expect(check(tonight("n", { closeAt: 1260 }), at("18:30"))).toBe(false);
    expect(check(tonight("n", { stop: { from: 1140, to: 1200 } }), at("18:30"))).toBe(false);
  });

  it("treats a stop over the rest of the service as the emergency close", () => {
    expect(check(tonight("n", { stop: { from: 1100, to: 1400 } }), at("18:30"))).toBe(true);
  });

  it("lets a Host close early once the last seating has passed", () => {
    // last seating 22:00; now 22:30; closing at 22:45 takes no seating away
    expect(check(tonight("n", { closeAt: 1365 }), at("22:30"))).toBe(false);
  });

  it("judges the last step of closing the night in steps", () => {
    const first = tonight("first", { stop: { from: 1020, to: 1260 } });
    expect(check(tonight("n", { closeAt: 1260 }), at("16:00"), { stored: [first] })).toBe(true);
  });

  it("does not count the rule being replaced as an earlier step", () => {
    const same = tonight("n", { closeAt: 1100 });
    expect(check(tonight("n", { closeAt: 1320 }), at("16:00"), { stored: [same] })).toBe(false);
  });

  it("follows a service that runs past midnight", () => {
    const hours = { opensAt: 1320, lastSeatingAt: 1500, closesAt: 1560 };
    expect(check(tonight("n", { closeAt: 1340 }), at("22:30"), { hours })).toBe(true);
    expect(check(tonight("n", { closeAt: 1500 }), at("22:30"), { hours })).toBe(false);
  });
});
