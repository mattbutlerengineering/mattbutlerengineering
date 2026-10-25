import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { computeClosureImpact, type ImpactBooking } from "./closure-impact.js";

const TZ = "America/Los_Angeles";

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-1",
      venueServiceId: "vs-dinner",
      opensAt: 1020, // 5:00 PM
      lastSeatingAt: 1260, // 9:00 PM
      closesAt: 1380, // 11:00 PM
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

/** A booking on `date` at local `hh:mm` (PST, UTC-8, in December), lasting 90 minutes. */
function booking(
  id: string,
  date: string,
  hh: number,
  mm: number,
  extra: Partial<ImpactBooking> = {}
): ImpactBooking {
  const start = new Date(Date.parse(`${date}T00:00:00.000Z`) + ((hh + 8) * 60 + mm) * 60_000);
  return {
    id,
    tableId: "t-1",
    date: new Date(`${date}T00:00:00.000Z`),
    startTime: start,
    endTime: new Date(start.getTime() + 90 * 60_000),
    partySize: 4,
    guestName: id,
    heldDeposit: null,
    ...extra,
  };
}

const closure = (patch: Partial<DateRule> = {}): DateRule =>
  ({
    id: "dr-new",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    ...patch,
  }) as DateRule;

const impact = (rule: DateRule, bookings: ImpactBooking[]) =>
  computeClosureImpact({ timezone: TZ, config: CONFIG, rule, bookings });

describe("computeClosureImpact", () => {
  it("groups a whole-day closure's bookings as closed, with covers and held deposits", () => {
    const result = impact(closure(), [
      booking("a", "2026-12-24", 19, 0, {
        heldDeposit: { amountCents: 4000, currency: "usd" },
      }),
      booking("b", "2026-12-24", 17, 30, { partySize: 2 }),
      booking("other-day", "2026-12-23", 19, 0),
    ]);

    expect(result).toMatchObject({ reservations: 2, covers: 6, depositsHeld: 1 });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      groupKey: "2026-12-24:closed",
      date: "2026-12-24",
      kind: "closed",
      covers: 6,
      depositsHeld: 1,
    });
    // Sorted by start time; deposit surfaced on the booking that holds it.
    expect(result.groups[0]!.reservations.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result.groups[0]!.reservations[1]!.deposit).toEqual({
      amountCents: 4000,
      currency: "usd",
    });
    expect(result.groups[0]!.reservations.every((r) => !r.runsIntoClosure)).toBe(true);
  });

  it("groups a shortened service's stranded bookings as shortened", () => {
    const shortened: DateRule = {
      id: "dr-new",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      payload: {
        version: 1,
        services: [
          {
            venueServiceId: "vs-dinner",
            opensAt: 960, // 4:00 PM
            lastSeatingAt: 1080, // 6:00 PM
            closesAt: 1200, // 8:00 PM
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        ],
      },
    };

    const result = impact(shortened, [
      booking("early", "2026-12-24", 17, 0),
      booking("late", "2026-12-24", 20, 0),
    ]);

    expect(result.groups.map((g) => [g.groupKey, g.reservations.map((r) => r.id)])).toEqual([
      ["2026-12-24:shortened", ["late"]],
    ]);
  });

  it("has no groups for a booking-only closure", () => {
    const onlineOnly = closure({ targetKind: "booking", bookingTypes: ["online", "phone"] });
    expect(impact(onlineOnly, [booking("a", "2026-12-24", 19, 0)])).toEqual({
      reservations: 0,
      covers: 0,
      depositsHeld: 0,
      groups: [],
    });
  });

  it("groups a multi-date closure by date", () => {
    const result = impact(closure({ endsOn: "2026-12-26" }), [
      booking("d26", "2026-12-26", 19, 0),
      booking("d24", "2026-12-24", 19, 0),
      booking("d25", "2026-12-25", 19, 0),
      booking("d27", "2026-12-27", 19, 0),
    ]);

    expect(result.groups.map((g) => g.groupKey)).toEqual([
      "2026-12-24:closed",
      "2026-12-25:closed",
      "2026-12-26:closed",
    ]);
    expect(result.reservations).toBe(3);
  });

  it("flags a booking that starts before a window closure and runs into it", () => {
    // Closed from 10:00 PM (1320); the 9:00 PM booking runs to 10:30 PM.
    const late = closure({ window: { version: 1, from: 1320, to: 1440 } });

    const result = impact(late, [
      booking("runs-into", "2026-12-24", 21, 0),
      booking("before", "2026-12-24", 19, 0),
    ]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ kind: "shortened" });
    expect(result.groups[0]!.reservations.map((r) => [r.id, r.runsIntoClosure])).toEqual([
      ["runs-into", true],
    ]);
  });

  it("ignores a booking the venue already could not serve", () => {
    const base: AvailabilityConfig = {
      ...CONFIG,
      dateRules: [
        { id: "old", kind: "closure", targetKind: "venue", startsOn: "2026-12-24", endsOn: null },
      ],
    };
    const result = computeClosureImpact({
      timezone: TZ,
      config: base,
      rule: closure({ id: "dr-new" }),
      bookings: [booking("a", "2026-12-24", 19, 0)],
    });
    expect(result.reservations).toBe(0);
  });

  /** A booking from explicit instants, for dates where the UTC offset is not -8. */
  const at = (date: string, startIso: string, endIso: string): ImpactBooking => ({
    ...booking("x", date, 0, 0),
    date: new Date(`${date}T00:00:00.000Z`),
    startTime: new Date(startIso),
    endTime: new Date(endIso),
  });
  const flags = (result: ReturnType<typeof impact>) =>
    result.groups.flatMap((g) => g.reservations.map((r) => r.runsIntoClosure));

  it("flags a booking that runs past a Tonight close-early", () => {
    const tonight = {
      id: "dr-new",
      kind: "tonight",
      targetKind: "venue",
      startsOn: "2026-11-02",
      endsOn: "2026-11-02",
      payload: { version: 1, closeAt: 1260 }, // closes 9:00 PM
    } as DateRule;

    // 8:30 - 10:00 PM PST
    const result = impact(tonight, [
      at("2026-11-02", "2026-11-03T04:30:00Z", "2026-11-03T06:00:00Z"),
    ]);

    expect(result.reservations).toBe(1);
    expect(result.groups[0]).toMatchObject({ kind: "shortened" });
    expect(flags(result)).toEqual([true]);
  });

  it("flags a booking that already ran past the old close when the close moves earlier", () => {
    const tonight = {
      id: "dr-new",
      kind: "tonight",
      targetKind: "venue",
      startsOn: "2026-11-02",
      endsOn: "2026-11-02",
      payload: { version: 1, closeAt: 1350 }, // closes 10:30 PM (was 11:00 PM)
    } as DateRule;

    // 9:00 - 11:15 PM PST: a large party at last seating, already past the old close
    const result = impact(tonight, [
      at("2026-11-02", "2026-11-03T05:00:00Z", "2026-11-03T07:15:00Z"),
    ]);

    expect(result.reservations).toBe(1);
    expect(flags(result)).toEqual([true]);
  });

  it("flags a booking that runs past shortened hours, and one now past last seating", () => {
    const shortened = {
      id: "dr-new",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      payload: {
        version: 1,
        services: [
          {
            venueServiceId: "vs-dinner",
            opensAt: 960,
            lastSeatingAt: 1080, // 6:00 PM
            closesAt: 1200, // 8:00 PM
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        ],
      },
    } as DateRule;

    const result = impact(shortened, [
      booking("runs-past-close", "2026-12-24", 19, 0), // 7:00 - 8:30 PM
      booking("past-last-seating", "2026-12-24", 18, 30, { partySize: 2 }), // 6:30 - 8:00 PM
      booking("fine", "2026-12-24", 17, 0), // 5:00 - 6:30 PM
    ]);

    expect(result.groups[0]!.reservations.map((r) => [r.id, r.runsIntoClosure])).toEqual([
      ["past-last-seating", false],
      ["runs-past-close", true],
    ]);
  });

  it.each([
    ["fall-back", "2026-11-01", "2026-11-02T05:00:00Z", "2026-11-02T06:30:00Z"],
    ["spring-forward", "2026-03-08", "2026-03-09T04:00:00Z", "2026-03-09T05:30:00Z"],
    ["an ordinary day", "2026-11-02", "2026-11-03T05:00:00Z", "2026-11-03T06:30:00Z"],
  ])("compares wall-clock minutes on %s", (_label, date, start, end) => {
    // 9:00 - 10:30 PM local; the window closes from 9:30 PM.
    const late = closure({
      startsOn: date,
      endsOn: date,
      window: { version: 1, from: 1290, to: 1440 },
    });

    expect(flags(impact(late, [at(date, start, end)]))).toEqual([true]);
  });
});
