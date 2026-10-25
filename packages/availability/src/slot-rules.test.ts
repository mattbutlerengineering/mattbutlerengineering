import { describe, it, expect } from "vitest";
import {
  estimateDuration,
  filterSuitableTables,
  overlapWindow,
  activeHoldWindow,
  checkTableConflict as engineCheckTableConflict,
  checkPacingForSlot as engineCheckPacingForSlot,
  selectBestTable as engineSelectBestTable,
  type EngineSettings,
  type ReservationSlim,
  type HoldSlim,
  type TableCandidate,
  type TableFilter,
} from "./slot-rules.js";

/*
 * Ported verbatim from services/reservations/src/services/slot-rules.test.ts
 * (#7499). The engine takes the current instant as an argument; these
 * wrappers pass the wall clock so the original cases run unchanged.
 */
const checkTableConflict = (
  tableId: string,
  start: Date,
  end: Date,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
) => engineCheckTableConflict(tableId, start, end, reservations, holds, new Date());

const checkPacingForSlot = (
  start: Date,
  partySize: number,
  settings: EngineSettings | null | undefined,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
) => engineCheckPacingForSlot(start, partySize, settings, reservations, holds, new Date());

const selectBestTable = (
  candidates: TableCandidate[],
  start: Date,
  end: Date,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
) => engineSelectBestTable(candidates, start, end, reservations, holds, new Date());

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

describe("checkPacingForSlot: Tonight cover cap", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const now = new Date("2026-05-05T12:00:00Z");
  const booked: ReservationSlim = {
    id: "r",
    tableId: "t",
    startTime: start,
    endTime: new Date("2026-05-05T19:30:00Z"),
    partySize: 4,
  };

  it("applies the cap when no pacing rule exists", () => {
    expect(engineCheckPacingForSlot(start, 2, null, [booked], [], now, 5)).toBe(false);
    expect(engineCheckPacingForSlot(start, 1, null, [booked], [], now, 5)).toBe(true);
  });

  it("takes the lower of the rule and the cap", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 20 }] };
    expect(engineCheckPacingForSlot(start, 2, settings, [booked], [], now, 5)).toBe(false);
  });
});
