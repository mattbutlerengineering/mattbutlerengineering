import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { computeClosureImpact, type ImpactBooking } from "./closure-impact.js";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-12-01T20:00:00.000Z");

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
      weekdays: [],
      dayHours: { version: 1 as const, sets: [] },
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
  computeClosureImpact({ timezone: TZ, config: CONFIG, rule, bookings, now: NOW });

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

  it("carries the host each booking came from, allowlisted, so its notice previews in that brand (#8013)", () => {
    const result = impact(closure(), [
      booking("eat", "2026-12-24", 19, 0, { originHost: "eat-sheet.com" }),
      booking("home", "2026-12-24", 19, 15, { originHost: "mattbutlerengineering.com" }),
      booking("odd", "2026-12-24", 19, 30, { originHost: "evil.example" }),
      booking("none", "2026-12-24", 19, 45),
    ]);
    expect(result.groups[0]!.reservations.map((r) => [r.id, r.originHost])).toEqual([
      ["eat", "eat-sheet.com"],
      ["home", "mattbutlerengineering.com"],
      ["odd", null],
      ["none", null],
    ]);
  });

  it("carries the language each booking was made in, so its notice previews in it (#8388)", () => {
    const result = impact(closure(), [
      booking("fr", "2026-12-24", 19, 0, { locale: "fr-CA" }),
      booking("es", "2026-12-24", 19, 15, { locale: "es-MX" }),
      booking("odd", "2026-12-24", 19, 30, { locale: "tlh" }),
      booking("none", "2026-12-24", 19, 45),
    ]);
    expect(result.groups[0]!.reservations.map((r) => [r.id, r.locale])).toEqual([
      ["fr", "fr-CA"],
      ["es", "es-MX"],
      ["odd", "en-US"],
      ["none", "en-US"],
    ]);
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

  describe("the start a move would give each booking", () => {
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
            opensAt: 960,
            lastSeatingAt: 1080,
            closesAt: 1200,
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        ],
      },
    };

    it("is the nearest open start from the logic the closure command moves with", () => {
      const result = impact(shortened, [booking("late", "2026-12-24", 20, 0)]);
      // 8:00 PM cannot seat after 6:00 PM last seating: 6:00 PM PST is 02:00Z the next day.
      expect(result.groups[0]!.reservations[0]!.proposedStart).toBe("2026-12-25T02:00:00.000Z");
    });

    it("is null for a booking too long for any open service, so a move is refused", () => {
      const long = booking("long", "2026-12-24", 20, 0);
      const stuck = { ...long, endTime: new Date(long.startTime.getTime() + 300 * 60_000) };
      const result = impact(shortened, [stuck]);
      expect(result.groups[0]!.reservations[0]!.proposedStart).toBeNull();
    });

    describe("the tables the move lands on (closure-apply's targetTaken)", () => {
      /** An hour-long booking on a table, `hh:mm` PST on Dec 24. */
      const hour = (id: string, tableId: string, hh: number, mm = 0): ImpactBooking => {
        const b = booking(id, "2026-12-24", hh, mm, { tableId });
        return { ...b, endTime: new Date(b.startTime.getTime() + 60 * 60_000) };
      };
      const slim = (b: ImpactBooking) => ({
        id: b.id,
        tableId: b.tableId as string,
        startTime: b.startTime,
        endTime: b.endTime,
        partySize: b.partySize,
      });
      const proposals = (
        bookings: ImpactBooking[],
        occupancy: Parameters<typeof computeClosureImpact>[0]["occupancy"]
      ) =>
        Object.fromEntries(
          computeClosureImpact({
            timezone: TZ,
            config: CONFIG,
            rule: shortened,
            bookings,
            now: NOW,
            occupancy,
          }).groups[0]!.reservations.map((r) => [r.id, r.proposedStart])
        );

      const a = hour("a", "t1", 20);
      const b = hour("b", "t1", 21);
      const c = hour("c", "t2", 21);
      const SIX_PM = "2026-12-25T02:00:00.000Z";

      it("proposes a table's second booking nothing when the first has already taken the slot", () => {
        // All three would go to 6:00 PM; a gets there first, so b (same table) cannot, c (other table) can.
        expect(proposals([a, b, c], { reservations: [a, b, c].map(slim), holds: [] })).toEqual({
          a: SIX_PM,
          b: null,
          c: SIX_PM,
        });
      });

      it("is null when an unaffected booking sits in the target window", () => {
        const kept = hour("kept", "t1", 17, 30); // 5:30-6:30 PM, inside the new hours
        expect(proposals([a], { reservations: [slim(a), slim(kept)], holds: [] })).toEqual({
          a: null,
        });
      });

      it("is null under an active hold, and not under an expired one", () => {
        const hold = (expiresAt: Date) => ({
          id: "h1",
          tableId: "t1",
          startTime: new Date(SIX_PM),
          endTime: new Date(Date.parse(SIX_PM) + 60 * 60_000),
          partySize: 2,
          expiresAt,
        });
        const live = new Date(NOW.getTime() + 60_000);
        const dead = new Date(NOW.getTime() - 60_000);
        expect(proposals([a], { reservations: [slim(a)], holds: [hold(live)] })).toEqual({
          a: null,
        });
        expect(proposals([a], { reservations: [slim(a)], holds: [hold(dead)] })).toEqual({
          a: SIX_PM,
        });
      });

      it("does not collide with itself, and leaves a booking with no table unchecked", () => {
        const loose = { ...hour("loose", "t1", 20), tableId: null };
        expect(proposals([a, loose], { reservations: [slim(a)], holds: [] })).toEqual({
          a: SIX_PM,
          loose: SIX_PM,
        });
      });
    });

    it("is absent on a closed day, where a move is not offered", () => {
      const result = impact(closure(), [booking("a", "2026-12-24", 19, 0)]);
      expect(result.groups[0]!.reservations[0]!.proposedStart).toBeUndefined();
    });
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
      now: NOW,
      timezone: TZ,
      config: base,
      rule: closure({ id: "dr-new" }),
      bookings: [booking("a", "2026-12-24", 19, 0)],
    });
    expect(result.reservations).toBe(0);
  });

  it("counts only the dates a series edit newly closes, with the replaced series and its skips applied", () => {
    // Thursdays, with Dec 24 skipped; the edit adds Fridays.
    const series: DateRule = {
      id: "s1",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-01",
      endsOn: null,
      repeat: { version: 1, weekdays: [4] },
    };
    const skip: DateRule = {
      id: "k1",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      seriesId: "s1",
    };
    const edited: DateRule = { ...series, id: "s2", repeat: { version: 1, weekdays: [4, 5] } };
    const bookings = [booking("thu", "2026-12-24", 19, 0), booking("fri", "2026-12-25", 19, 0)];
    const config = { ...CONFIG, dateRules: [series, skip] };

    const result = computeClosureImpact({
      now: NOW,
      timezone: TZ,
      config,
      rule: edited,
      bookings,
      alongside: { upsert: [{ ...skip, seriesId: "s2" }], remove: ["s1"] },
    });

    expect(result.groups.map((g) => [g.groupKey, g.reservations.map((r) => r.id)])).toEqual([
      ["2026-12-25:closed", ["fri"]],
    ]);
  });

  it("still offers a booking an unrelated earlier closure already cut into, when a new one cuts earlier", () => {
    const existing = closure({
      id: "c1",
      window: { version: 1, from: 1290, to: 1440 }, // closed from 9:30 PM
    });
    const result = computeClosureImpact({
      now: NOW,
      timezone: TZ,
      config: { ...CONFIG, dateRules: [existing] },
      rule: closure({ id: "c2", window: { version: 1, from: 1260, to: 1440 } }), // from 9:00 PM
      bookings: [booking("b", "2026-12-24", 20, 30)], // 8:30 to 10:00 PM
    });
    expect(result.reservations).toBe(1);
  });

  it("does not offer again a booking the replaced series' window already cut into", () => {
    const window = { version: 1 as const, from: 1320, to: 1440 }; // closed from 10:00 PM
    const series: DateRule = {
      id: "s1",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-01",
      endsOn: null,
      repeat: { version: 1, weekdays: [4] },
      window,
    };
    const edited: DateRule = { ...series, id: "s2", repeat: { version: 1, weekdays: [4, 5] } };

    const result = computeClosureImpact({
      now: NOW,
      timezone: TZ,
      config: { ...CONFIG, dateRules: [series] },
      rule: edited,
      alongside: { upsert: [], remove: ["s1"] },
      bookings: [booking("thu-kept", "2026-12-24", 21, 0), booking("fri-new", "2026-12-25", 21, 0)],
    });

    expect(result.groups.map((g) => [g.groupKey, g.reservations.map((r) => r.id)])).toEqual([
      ["2026-12-25:shortened", ["fri-new"]],
    ]);
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
