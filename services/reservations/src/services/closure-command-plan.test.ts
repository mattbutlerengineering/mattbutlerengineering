import { describe, expect, it } from "vitest";
import type { AvailabilitySnapshot } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import { checkDecisions, moveTarget } from "./closure-command-plan.js";

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

describe("checkDecisions and a group that changed since the preview", () => {
  const impact = (ids: string[]) =>
    ({
      groups: [
        {
          groupKey: "2026-12-24:closed",
          date: "2026-12-24",
          kind: "closed",
          reservations: ids.map((id) => ({ id })),
        },
      ],
    }) as unknown as Parameters<typeof checkDecisions>[0];

  it("asks again when a guest booked after the Manager saw the group", () => {
    const decision = {
      groupKey: "2026-12-24:closed",
      action: "cancel" as const,
      reservationIds: ["a", "b"],
    };
    expect(checkDecisions(impact(["a", "b", "c"]), [decision])).toEqual({
      kind: "decision-required",
      groupKeys: ["2026-12-24:closed"],
    });
  });

  it("asks again, not invalid, when a booking was cancelled or moved out of the group", () => {
    const decision = {
      groupKey: "2026-12-24:closed",
      action: "cancel" as const,
      reservationIds: ["a", "b", "c"],
    };
    expect(checkDecisions(impact(["a", "b"]), [decision])).toEqual({
      kind: "decision-required",
      groupKeys: ["2026-12-24:closed"],
    });
  });

  it("asks again, not invalid, when the whole group is gone since the preview", () => {
    const decision = {
      groupKey: "2026-12-24:closed",
      action: "cancel" as const,
      reservationIds: ["a"],
    };
    const empty = { groups: [] } as unknown as Parameters<typeof checkDecisions>[0];
    expect(checkDecisions(empty, [decision])).toEqual({
      kind: "decision-required",
      groupKeys: ["2026-12-24:closed"],
    });
  });

  it("still calls a decision naming an unknown group, with no bookings sent, invalid", () => {
    const decision = { groupKey: "2026-12-30:closed", action: "cancel" as const };
    expect(checkDecisions(impact(["a"]), [decision]).kind).toBe("invalid-decision");
  });

  it("accepts the same members in any order, and a decision that names none", () => {
    const named = { groupKey: "2026-12-24:closed", action: "cancel" as const };
    expect(
      checkDecisions(impact(["a", "b"]), [{ ...named, reservationIds: ["b", "a"] }]).kind
    ).toBe("ok");
    expect(checkDecisions(impact(["a", "b"]), [named]).kind).toBe("ok");
  });
});
