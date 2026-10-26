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

  describe("counts seating slots on the service grid, not minutes (now 18:31, 15-minute grid)", () => {
    // Dinner 17:00-22:00 (1020-1320 last seating): the next grid slot after 18:31 is 18:45.
    const hours = { opensAt: 1020, lastSeatingAt: 1320, closesAt: 1380 };
    const now = at("18:31");
    it.each([
      ["a stop from the minute after now", { stop: { from: 1112, to: 1400 } }],
      ["a stop from the next slot", { stop: { from: 1125, to: 1400 } }],
      ["a close-early at now", { closeAt: 1111 }],
      ["a close-early before the next slot", { closeAt: 1124 }],
      ["a close-early at 18:40", { closeAt: 1120 }],
    ])("treats %s as the emergency close", (_label, payload) => {
      expect(check(tonight("n", payload), now, { hours })).toBe(true);
    });

    it("allows a close-early that keeps the 18:45 slot but cuts the service short", () => {
      // 18:45 is still bookable, so it is not empty; seatings from open 17:00-19:15 span 135 min.
      expect(check(tonight("n", { closeAt: 1155 }), now, { hours })).toBe(false);
    });

    it("treats a close-early at the next slot as the emergency close: nothing seats at close", () => {
      expect(check(tonight("n", { closeAt: 1125 }), now, { hours })).toBe(true);
    });

    it("allows a stop that leaves a later slot", () => {
      expect(check(tonight("n", { stop: { from: 1126, to: 1400 } }), now, { hours })).toBe(false);
    });
  });

  it("follows a service that runs past midnight", () => {
    const hours = { opensAt: 1320, lastSeatingAt: 1500, closesAt: 1560 };
    expect(check(tonight("n", { closeAt: 1340 }), at("22:30"), { hours })).toBe(true);
    expect(check(tonight("n", { closeAt: 1500 }), at("22:30"), { hours })).toBe(false);
  });
});
