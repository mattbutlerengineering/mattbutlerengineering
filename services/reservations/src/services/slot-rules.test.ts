import { describe, it, expect } from "vitest";
import {
  estimateDuration,
  filterSuitableTables,
  bookingWindow,
  isSlotInBookingWindow,
  checkGuestModificationPolicy,
  parseOperatingHours,
  selectBestTable,
  checkTableConflict,
  checkPacingForSlot,
  overlapWindow,
  activeHoldWindow,
  NOT_BOOKED_STATUSES,
  type ReservationSlim,
  type HoldSlim,
  type TableCandidate,
  type TableFilter,
} from "./slot-rules.js";

describe("estimateDuration", () => {
  it("returns 75 minutes for party of 1-2 (default rules)", () => {
    expect(estimateDuration(1)).toBe(75);
    expect(estimateDuration(2)).toBe(75);
  });

  it("returns 90 minutes for party of 3-4 (default rules)", () => {
    expect(estimateDuration(3)).toBe(90);
    expect(estimateDuration(4)).toBe(90);
  });

  it("returns 105 minutes for party of 5-6 (default rules)", () => {
    expect(estimateDuration(5)).toBe(105);
    expect(estimateDuration(6)).toBe(105);
  });

  it("returns 120 minutes for party of 7-10 (default rules)", () => {
    expect(estimateDuration(7)).toBe(120);
    expect(estimateDuration(10)).toBe(120);
  });

  it("extrapolates for parties larger than rules cover", () => {
    // maxPartySize in default rules = 10, extra = 2, ceil(2/2)*15 = 15
    expect(estimateDuration(12)).toBe(120 + 15);
  });

  it("extrapolates correctly for odd extra guests", () => {
    // extra = 1, ceil(1/2)*15 = 15
    expect(estimateDuration(11)).toBe(120 + 15);
  });

  it("uses venue-specific duration rules when provided", () => {
    const settings = {
      durationRules: [
        { minPartySize: 1, maxPartySize: 4, durationMinutes: 60 },
        { minPartySize: 5, maxPartySize: 8, durationMinutes: 90 },
      ],
    };
    expect(estimateDuration(2, settings)).toBe(60);
    expect(estimateDuration(6, settings)).toBe(90);
  });

  it("falls back to defaultReservationDuration when no rule matches", () => {
    const settings = {
      durationRules: [{ minPartySize: 1, maxPartySize: 2, durationMinutes: 60 }],
      defaultReservationDuration: 120,
    };
    expect(estimateDuration(8, settings)).toBe(120);
  });

  it("extrapolates from venue rules when no default and no match", () => {
    const settings = {
      durationRules: [{ minPartySize: 1, maxPartySize: 4, durationMinutes: 60 }],
    };
    // party 6, max = 4, extra = 2, ceil(2/2)*15 = 15
    expect(estimateDuration(6, settings)).toBe(60 + 15);
  });
});

describe("filterSuitableTables (pure)", () => {
  function makeTable(overrides: Partial<TableFilter> = {}): TableFilter {
    return {
      id: "table-1",
      capacity: 4,
      minCovers: 1,
      maxCovers: 6,
      isActive: true,
      ...overrides,
    };
  }

  it("returns tables where partySize fits within minCovers..maxCovers", () => {
    const tables = [
      makeTable({ id: "t-2", minCovers: 1, maxCovers: 2 }),
      makeTable({ id: "t-4", minCovers: 1, maxCovers: 4 }),
      makeTable({ id: "t-6", minCovers: 1, maxCovers: 6 }),
    ];
    const result = filterSuitableTables(tables, 3);
    expect(result.map((t) => t.id)).toEqual(["t-4", "t-6"]);
  });

  it("excludes inactive tables", () => {
    const tables = [
      makeTable({ id: "active", isActive: true }),
      makeTable({ id: "inactive", isActive: false }),
    ];
    expect(filterSuitableTables(tables, 2).map((t) => t.id)).toEqual(["active"]);
  });

  it("excludes tables where partySize < minCovers", () => {
    const tables = [makeTable({ minCovers: 4, maxCovers: 8 })];
    expect(filterSuitableTables(tables, 2)).toEqual([]);
  });

  it("excludes tables where partySize > maxCovers", () => {
    const tables = [makeTable({ minCovers: 1, maxCovers: 3 })];
    expect(filterSuitableTables(tables, 4)).toEqual([]);
  });

  it("treats null maxCovers as the table's capacity, not unlimited (#6495)", () => {
    const tables = [makeTable({ capacity: 4, minCovers: 1, maxCovers: null })];
    expect(filterSuitableTables(tables, 4)).toHaveLength(1);
    expect(filterSuitableTables(tables, 10)).toEqual([]);
  });

  it("returns empty array when no tables provided", () => {
    expect(filterSuitableTables([], 2)).toEqual([]);
  });

  it("exact fit: includes table where partySize equals maxCovers", () => {
    const tables = [makeTable({ minCovers: 1, maxCovers: 4 })];
    expect(filterSuitableTables(tables, 4)).toHaveLength(1);
  });

  it("exact fit: includes table where partySize equals minCovers", () => {
    const tables = [makeTable({ minCovers: 2, maxCovers: 4 })];
    expect(filterSuitableTables(tables, 2)).toHaveLength(1);
  });
});

describe("parseOperatingHours (pure)", () => {
  // Dates chosen so new Date(str).getUTCDay() is the intended weekday:
  //   2026-05-04 = Mon, 2026-05-08 = Fri, 2026-05-09 = Sat, 2026-05-10 = Sun
  const openHours = {
    monday: { open: "11:00", close: "22:00" },
    tuesday: { open: "11:00", close: "22:00" },
    wednesday: { open: "11:00", close: "22:00" },
    thursday: { open: "11:00", close: "22:00" },
    friday: { open: "11:00", close: "23:00" },
    saturday: { open: "10:00", close: "23:00" },
    sunday: { open: "10:00", close: "21:00" },
  };

  it("returns the schedule for an open weekday (Monday = 2026-05-04)", () => {
    const result = parseOperatingHours(openHours, "2026-05-04");
    expect(result).not.toBeNull();
    expect(result!.open).toBe("11:00");
    expect(result!.close).toBe("22:00");
  });

  it("returns null when operatingHours is null", () => {
    expect(parseOperatingHours(null, "2026-05-04")).toBeNull();
  });

  it("returns null for a day marked closed: true", () => {
    const withClosedSunday = {
      ...openHours,
      sunday: { open: "10:00", close: "21:00", closed: true },
    };
    expect(parseOperatingHours(withClosedSunday, "2026-05-10")).toBeNull();
  });

  it("returns null when the day has no schedule entry", () => {
    const noSunday = { monday: openHours.monday };
    expect(parseOperatingHours(noSunday, "2026-05-10")).toBeNull();
  });

  it("returns Friday schedule for a Friday date (2026-05-08)", () => {
    const result = parseOperatingHours(openHours, "2026-05-08");
    expect(result).not.toBeNull();
    expect(result!.close).toBe("23:00");
  });

  it("returns Saturday schedule for a Saturday date (2026-05-09)", () => {
    const result = parseOperatingHours(openHours, "2026-05-09");
    expect(result).not.toBeNull();
    expect(result!.open).toBe("10:00");
  });
});

describe("NOT_BOOKED_STATUSES (shared declaration)", () => {
  it("excludes CANCELLED and NO_SHOW — the statuses that free a table slot", () => {
    expect(NOT_BOOKED_STATUSES).toEqual(["CANCELLED", "NO_SHOW"]);
  });
});

describe("overlapWindow (shared declaration)", () => {
  it("returns the half-open [startTime, endTime) threshold pair", () => {
    const startTime = new Date("2026-05-05T18:00:00Z");
    const endTime = new Date("2026-05-05T19:15:00Z");

    expect(overlapWindow(startTime, endTime)).toEqual({
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    });
  });
});

describe("activeHoldWindow (shared declaration)", () => {
  it("returns a gt-now threshold — a hold guards its slot only while unexpired", () => {
    const now = new Date("2026-05-05T18:00:00Z");
    expect(activeHoldWindow(now)).toEqual({ gt: now });
  });
});

describe("checkTableConflict (pure)", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const end = new Date("2026-05-05T19:15:00Z");
  const future = new Date(Date.now() + 300_000);

  function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
    return {
      id: "res-1",
      tableId: "table-1",
      startTime: new Date("2026-05-05T18:30:00Z"),
      endTime: new Date("2026-05-05T20:00:00Z"),
      partySize: 2,
      ...overrides,
    };
  }

  function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
    return {
      id: "hold-1",
      tableId: "table-1",
      startTime: new Date("2026-05-05T18:30:00Z"),
      endTime: new Date("2026-05-05T20:00:00Z"),
      partySize: 2,
      expiresAt: future,
      ...overrides,
    };
  }

  it("returns false when no reservations or holds", () => {
    expect(checkTableConflict("table-1", start, end, [], [])).toBe(false);
  });

  it("returns true for an overlapping reservation on the same table", () => {
    expect(checkTableConflict("table-1", start, end, [makeReservation()], [])).toBe(true);
  });

  it("ignores reservations on a different table", () => {
    expect(
      checkTableConflict("table-1", start, end, [makeReservation({ tableId: "table-2" })], [])
    ).toBe(false);
  });

  it("treats abutting reservation that ends exactly at start as no conflict (boundary)", () => {
    const res = makeReservation({
      startTime: new Date("2026-05-05T16:00:00Z"),
      endTime: start,
    });
    expect(checkTableConflict("table-1", start, end, [res], [])).toBe(false);
  });

  it("treats reservation that starts exactly at end as no conflict (boundary)", () => {
    const res = makeReservation({
      startTime: end,
      endTime: new Date("2026-05-05T21:00:00Z"),
    });
    expect(checkTableConflict("table-1", start, end, [res], [])).toBe(false);
  });

  it("returns true for an overlapping active hold", () => {
    expect(checkTableConflict("table-1", start, end, [], [makeHold()])).toBe(true);
  });

  it("ignores an expired hold even when it overlaps", () => {
    const expired = makeHold({ expiresAt: new Date(Date.now() - 1000) });
    expect(checkTableConflict("table-1", start, end, [], [expired])).toBe(false);
  });

  it("ignores a hold on a different table", () => {
    expect(checkTableConflict("table-1", start, end, [], [makeHold({ tableId: "table-2" })])).toBe(
      false
    );
  });
});

describe("checkPacingForSlot (pure)", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const future = new Date(Date.now() + 300_000);

  function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
    return {
      id: "res-1",
      tableId: "table-1",
      startTime: start,
      endTime: new Date("2026-05-05T19:30:00Z"),
      partySize: 4,
      ...overrides,
    };
  }

  function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
    return {
      id: "hold-1",
      tableId: "table-2",
      startTime: start,
      endTime: new Date("2026-05-05T19:30:00Z"),
      partySize: 2,
      expiresAt: future,
      ...overrides,
    };
  }

  it("returns true when no pacing rules configured", () => {
    expect(checkPacingForSlot(start, 4, null, [makeReservation()], [])).toBe(true);
    expect(checkPacingForSlot(start, 4, undefined, [makeReservation()], [])).toBe(true);
    expect(checkPacingForSlot(start, 4, { pacingRules: [] }, [makeReservation()], [])).toBe(true);
  });

  it("returns true when covers within limit", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 10 }] };
    expect(checkPacingForSlot(start, 2, settings, [makeReservation()], [])).toBe(true);
  });

  it("returns false when covers exceed limit", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4 }] };
    expect(checkPacingForSlot(start, 2, settings, [makeReservation()], [])).toBe(false);
  });

  it("counts active holds toward the pacing total", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 5 }] };
    expect(checkPacingForSlot(start, 1, settings, [makeReservation()], [makeHold()])).toBe(false);
  });

  it("excludes expired holds from the pacing total", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 5 }] };
    const expired = makeHold({ expiresAt: new Date(Date.now() - 1000), partySize: 4 });
    expect(checkPacingForSlot(start, 1, settings, [makeReservation()], [expired])).toBe(true);
  });

  it("only counts reservations starting within the time window", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] };
    const outside = makeReservation({
      startTime: new Date("2026-05-05T18:30:00Z"),
      partySize: 4,
    });
    expect(checkPacingForSlot(start, 2, settings, [outside], [])).toBe(true);
  });

  it("counts a reservation starting exactly at window start (inclusive lower bound)", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] };
    const atStart = makeReservation({ startTime: start, partySize: 4 });
    expect(checkPacingForSlot(start, 1, settings, [atStart], [])).toBe(false);
  });

  it("excludes a reservation starting exactly at window end (exclusive upper bound)", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] };
    const atEnd = makeReservation({
      startTime: new Date(start.getTime() + 15 * 60 * 1000),
      partySize: 4,
    });
    expect(checkPacingForSlot(start, 2, settings, [atEnd], [])).toBe(true);
  });
});

describe("selectBestTable (pure)", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const end = new Date("2026-05-05T19:15:00Z");
  const future = new Date(Date.now() + 300_000);

  function makeCandidate(overrides: Partial<TableCandidate> = {}): TableCandidate {
    return { id: "table-1", capacity: 4, priority: 5, ...overrides };
  }

  function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
    return {
      id: "hold-1",
      tableId: "table-1",
      startTime: start,
      endTime: end,
      partySize: 2,
      expiresAt: future,
      ...overrides,
    };
  }

  function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
    return {
      id: "res-1",
      tableId: "table-1",
      startTime: start,
      endTime: end,
      partySize: 2,
      ...overrides,
    };
  }

  it("returns null when no candidates provided", () => {
    expect(selectBestTable([], start, end, [], [])).toBeNull();
  });

  it("returns the single candidate when it has no conflicts", () => {
    const table = makeCandidate({ id: "t-1" });
    expect(selectBestTable([table], start, end, [], [])).toBe(table);
  });

  it("returns null when only candidate has a conflicting reservation", () => {
    const table = makeCandidate({ id: "table-1" });
    const res = makeReservation({ tableId: "table-1" });
    expect(selectBestTable([table], start, end, [res], [])).toBeNull();
  });

  it("returns null when only candidate has a conflicting active hold", () => {
    const table = makeCandidate({ id: "table-1" });
    const hold = makeHold({ tableId: "table-1" });
    expect(selectBestTable([table], start, end, [], [hold])).toBeNull();
  });

  it("priority tie: when two tables have same priority, selects smaller capacity first", () => {
    const small = makeCandidate({ id: "t-small", capacity: 2, priority: 5 });
    const large = makeCandidate({ id: "t-large", capacity: 8, priority: 5 });
    expect(selectBestTable([small, large], start, end, [], [])!.id).toBe("t-small");
  });

  it("capacity tie: when two tables have same capacity, selects higher priority first", () => {
    const high = makeCandidate({ id: "t-high", capacity: 4, priority: 10 });
    const low = makeCandidate({ id: "t-low", capacity: 4, priority: 3 });
    expect(selectBestTable([high, low], start, end, [], [])!.id).toBe("t-high");
  });

  it("skips booked tables and returns the next conflict-free one", () => {
    const booked = makeCandidate({ id: "table-1", priority: 10 });
    const free = makeCandidate({ id: "t-free", priority: 5 });
    const res = makeReservation({ tableId: "table-1" });
    expect(selectBestTable([booked, free], start, end, [res], [])!.id).toBe("t-free");
  });

  it("no-fit: returns null when all candidates conflict", () => {
    const t1 = makeCandidate({ id: "table-1" });
    const t2 = makeCandidate({ id: "table-2" });
    const res1 = makeReservation({ tableId: "table-1" });
    const res2 = makeReservation({ id: "res-2", tableId: "table-2" });
    expect(selectBestTable([t1, t2], start, end, [res1, res2], [])).toBeNull();
  });

  it("ignores expired holds — expired-hold table is still selectable", () => {
    const table = makeCandidate({ id: "table-1" });
    const expiredHold = makeHold({ expiresAt: new Date(Date.now() - 1000) });
    expect(selectBestTable([table], start, end, [], [expiredHold])).toBe(table);
  });
});

describe("bookingWindow / isSlotInBookingWindow", () => {
  const NOW = new Date("2026-05-05T22:00:00Z"); // 18:00 ET (UTC-4)
  const TZ = "America/New_York";

  it("excludes a slot already past (now - 30min)", () => {
    const window = bookingWindow(null, NOW, TZ);
    expect(isSlotInBookingWindow(new Date("2026-05-05T21:30:00Z"), window)).toBe(false);
    expect(isSlotInBookingWindow(new Date("2026-05-05T22:00:00Z"), window)).toBe(true);
  });

  it("excludes slots before now + minAdvanceBooking hours", () => {
    const window = bookingWindow({ minAdvanceBooking: 2 }, NOW, TZ);
    expect(isSlotInBookingWindow(new Date("2026-05-05T23:45:00Z"), window)).toBe(false);
    expect(isSlotInBookingWindow(new Date("2026-05-06T00:00:00Z"), window)).toBe(true);
  });

  it("excludes slots beyond maxAdvanceBooking days (venue-local date)", () => {
    const window = bookingWindow({ maxAdvanceBooking: 14 }, NOW, TZ);
    // 2026-05-19 23:30 ET is still local day +14 (UTC already May 20)
    expect(isSlotInBookingWindow(new Date("2026-05-20T03:30:00Z"), window)).toBe(true);
    // 2026-05-20 00:00 ET is day +15
    expect(isSlotInBookingWindow(new Date("2026-05-20T04:00:00Z"), window)).toBe(false);
  });

  it("is DST-safe: max window counts local calendar days across spring-forward", () => {
    const now = new Date("2026-03-07T17:00:00Z"); // 12:00 EST, day before DST
    const window = bookingWindow({ maxAdvanceBooking: 2 }, now, TZ);
    // local 2026-03-09 23:30 EDT = 2026-03-10T03:30Z -> day +2, allowed
    expect(isSlotInBookingWindow(new Date("2026-03-10T03:30:00Z"), window)).toBe(true);
    // local 2026-03-10 00:00 EDT = 04:00Z -> day +3, rejected
    expect(isSlotInBookingWindow(new Date("2026-03-10T04:00:00Z"), window)).toBe(false);
  });

  it("works for a venue ahead of UTC (Tokyo)", () => {
    const now = new Date("2026-05-05T16:00:00Z"); // 01:00 on 05-06 JST
    const window = bookingWindow({ maxAdvanceBooking: 0 }, now, "Asia/Tokyo");
    expect(isSlotInBookingWindow(new Date("2026-05-06T10:00:00Z"), window)).toBe(true);
    expect(isSlotInBookingWindow(new Date("2026-05-06T15:00:00Z"), window)).toBe(false);
  });
});

describe("checkGuestModificationPolicy", () => {
  const NOW = new Date("2026-05-05T12:00:00Z");
  const reservationIn = (hours: number, partySize = 4) => ({
    startTime: new Date(NOW.getTime() + hours * 60 * 60 * 1000),
    partySize,
  });

  it("blocks a time or party change inside the cutoff", () => {
    const settings = { guestModificationCutoffHours: 24 };
    expect(
      checkGuestModificationPolicy(settings, reservationIn(23), { movesTime: true }, NOW)
    ).toBe("MODIFICATION_CUTOFF");
    expect(checkGuestModificationPolicy(settings, reservationIn(23), { partySize: 5 }, NOW)).toBe(
      "MODIFICATION_CUTOFF"
    );
  });

  it("allows an edit that changes neither time nor party size inside the cutoff", () => {
    expect(
      checkGuestModificationPolicy(
        { guestModificationCutoffHours: 24 },
        reservationIn(1),
        { movesTime: false },
        NOW
      )
    ).toBeNull();
  });

  it("allows a change outside the cutoff", () => {
    expect(
      checkGuestModificationPolicy(
        { guestModificationCutoffHours: 24 },
        reservationIn(25),
        { movesTime: true },
        NOW
      )
    ).toBeNull();
  });

  it("caps the party-size delta in both directions", () => {
    const settings = { guestMaxPartySizeChange: 2 };
    expect(
      checkGuestModificationPolicy(settings, reservationIn(48, 4), { partySize: 7 }, NOW)
    ).toBe("PARTY_SIZE_CHANGE_TOO_LARGE");
    expect(
      checkGuestModificationPolicy(settings, reservationIn(48, 4), { partySize: 1 }, NOW)
    ).toBe("PARTY_SIZE_CHANGE_TOO_LARGE");
    expect(
      checkGuestModificationPolicy(settings, reservationIn(48, 4), { partySize: 6 }, NOW)
    ).toBeNull();
  });

  it("changes nothing when the settings are unset or absent", () => {
    const changes = { partySize: 20, movesTime: true };
    expect(checkGuestModificationPolicy({}, reservationIn(0), changes, NOW)).toBeNull();
    expect(checkGuestModificationPolicy(null, reservationIn(0), changes, NOW)).toBeNull();
  });
});

describe("filterSuitableTables: null maxCovers falls back to capacity", () => {
  it("rejects a party of 12 for a 2-top with null maxCovers", () => {
    const twoTop: TableFilter = {
      id: "t",
      capacity: 2,
      minCovers: 1,
      maxCovers: null,
      isActive: true,
    };
    expect(filterSuitableTables([twoTop], 12)).toEqual([]);
    expect(filterSuitableTables([twoTop], 2)).toEqual([twoTop]);
  });
});
