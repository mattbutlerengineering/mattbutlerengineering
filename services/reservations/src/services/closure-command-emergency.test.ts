import { describe, expect, it } from "vitest";
import type { AvailabilitySnapshot } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import { isEmergencyTonightClose } from "./closure-command-plan.js";

const DEFAULT_HOURS = { opensAt: 1020, lastSeatingAt: 1320, closesAt: 1380 };

type Hours = { opensAt: number; lastSeatingAt: number; closesAt: number };
type Seating = { version: 1; interval: number } | { version: 1; fixed: number[] };

const dinner = (hours: Hours, seating: Seating = { version: 1, interval: 15 }): DateRule =>
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
          seating,
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
  opts: { stored?: DateRule[]; hours?: Hours; seating?: Seating; tableIds?: string[] } = {}
): boolean {
  const snapshot = {
    timezone: "UTC",
    config: {
      venueServices: [{ id: "vs", name: "Dinner" }],
      schedules: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [dinner(opts.hours ?? DEFAULT_HOURS, opts.seating), ...(opts.stored ?? [])],
    },
  } as unknown as AvailabilitySnapshot;
  return isEmergencyTonightClose(snapshot, rule, now, opts.tableIds);
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
    const hours = DEFAULT_HOURS;
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

  describe("a service already shorter than the floor (#7687)", () => {
    const single = {
      hours: { opensAt: 1140, lastSeatingAt: 1140, closesAt: 1380 },
      seating: { version: 1 as const, fixed: [1140] },
    };
    const lunch = { hours: { opensAt: 690, lastSeatingAt: 735, closesAt: 810 } };

    it("allows a change that removes no seating from a single-seating service", () => {
      expect(check(tonight("n", { closeAt: 1320 }), at("16:00"), single)).toBe(false);
      expect(check(tonight("n", { stop: { from: 1300, to: 1380 } }), at("16:00"), single)).toBe(
        false
      );
    });

    it("allows a change that removes no seating from a short lunch", () => {
      expect(check(tonight("n", { closeAt: 800 }), at("10:00"), lunch)).toBe(false);
    });

    it("refuses a change that removes the only seating", () => {
      expect(check(tonight("n", { closeAt: 1140 }), at("16:00"), single)).toBe(true);
    });

    it("refuses cutting a short lunch below its own length", () => {
      expect(check(tonight("n", { closeAt: 700 }), at("10:00"), lunch)).toBe(true);
    });
  });

  describe("a venue-targeted change is judged per service (#7687)", () => {
    // Lunch 11:00-15:00 (last seating 14:00), dinner 17:00-22:00 (last seating 21:00), 15-min grid.
    const svc = (id: string, opensAt: number, lastSeatingAt: number, closesAt: number) => ({
      venueServiceId: id,
      opensAt,
      lastSeatingAt,
      closesAt,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online"],
    });
    const twoServices = {
      id: "sh2",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      payload: {
        version: 1,
        services: [svc("lunch", 660, 840, 900), svc("dinner", 1020, 1260, 1320)],
      },
    } as unknown as DateRule;
    const checkTwo = (rule: DateRule, now: Date): boolean =>
      isEmergencyTonightClose(
        {
          timezone: "UTC",
          config: {
            venueServices: [
              { id: "lunch", name: "Lunch" },
              { id: "dinner", name: "Dinner" },
            ],
            schedules: [],
            scheduleServices: [],
            assignments: [],
            dateRules: [twoServices],
          },
        } as unknown as AvailabilitySnapshot,
        rule,
        now
      );

    it("refuses a venue close-early that wipes dinner while lunch keeps slots", () => {
      expect(checkTwo(tonight("n", { closeAt: 735 }), at("10:00"))).toBe(true);
    });

    it("refuses a venue stop window that wipes dinner while lunch keeps slots", () => {
      expect(checkTwo(tonight("n", { stop: { from: 1000, to: 1400 } }), at("10:00"))).toBe(true);
    });

    it("allows a venue close-early that leaves both services bookable", () => {
      expect(checkTwo(tonight("n", { closeAt: 1260 }), at("10:00"))).toBe(false);
    });
  });

  it("follows a service that runs past midnight after midnight too", () => {
    const hours = { opensAt: 1320, lastSeatingAt: 1500, closesAt: 1560 };
    const after = new Date("2026-12-25T00:30:00.000Z");
    // 00:30 is minute 1470; the remaining seatings are 1470, 1485, 1500.
    expect(check(tonight("n", { closeAt: 1470 }), after, { hours })).toBe(true);
    expect(check(tonight("n", { closeAt: 1500 }), after, { hours })).toBe(false);
  });

  it("follows a service that runs past midnight", () => {
    const hours = { opensAt: 1320, lastSeatingAt: 1500, closesAt: 1560 };
    expect(check(tonight("n", { closeAt: 1340 }), at("22:30"), { hours })).toBe(true);
    expect(check(tonight("n", { closeAt: 1500 }), at("22:30"), { hours })).toBe(false);
  });
});

describe("isEmergencyTonightClose counts tables and channels (#7721)", () => {
  const block = (id: string, tableIds: string[]): DateRule =>
    ({
      ...tonight(id, { stop: { from: 0, to: 2880 } }),
      targetKind: "tables",
      tableIds,
    }) as DateRule;
  const pause = tonight("p", { stop: { from: 0, to: 2880 } }) as unknown as {
    [k: string]: unknown;
  };
  const pauseOnline = {
    ...pause,
    targetKind: "booking",
    bookingTypes: ["online"],
  } as unknown as DateRule;
  const tableIds = ["t-1", "t-2"];

  it("treats blocking every table as the close, and some tables as not", () => {
    expect(check(block("b", tableIds), at("16:00"), { tableIds })).toBe(true);
    expect(check(block("b", ["t-1"]), at("16:00"), { tableIds })).toBe(false);
  });

  it("judges the last step of blocking tables in steps", () => {
    const first = block("first", ["t-1"]);
    expect(check(block("b", ["t-2"]), at("16:00"), { tableIds, stored: [first] })).toBe(true);
  });

  it("treats pausing the only open channel as the close", () => {
    expect(check(pauseOnline, at("16:00"))).toBe(true);
  });
});
