import { describe, it, expect } from "vitest";
import { eventIndexAt, foldEvents, rehearsalMetrics, rehearsalStateAt } from "./rehearsal-state";
import { simulateService, type RehearsalEvent, type RehearsalTable } from "./simulate-service";

const OPEN = 17 * 60;
const CLOSE = 23 * 60;

const TABLES: readonly RehearsalTable[] = [
  { id: "a", name: "A", capacity: 2, minCovers: 1, maxCovers: null },
  { id: "b", name: "B", capacity: 4, minCovers: 2, maxCovers: null },
  { id: "c", name: "C", capacity: 6, minCovers: 3, maxCovers: null },
];

/** Hand-written night: a booked 2-top, a no-show, and a walk-in who waits 12 minutes. */
const HAND: readonly RehearsalEvent[] = [
  { at: 1020, kind: "booked", partyId: "p1", size: 2, tableId: "a", startAt: 1080, endAt: 1140 },
  { at: 1020, kind: "booked", partyId: "p2", size: 4, tableId: "b", startAt: 1090, endAt: 1105 },
  { at: 1080, kind: "seated", partyId: "p1", tableId: "a", size: 2, endAt: 1140 },
  { at: 1100, kind: "walk-in-waiting", partyId: "p3", size: 3 },
  { at: 1105, kind: "no-show", partyId: "p2", tableId: "b" },
  { at: 1112, kind: "seated", partyId: "p3", tableId: "c", size: 3, endAt: 1192 },
  { at: 1140, kind: "departed", partyId: "p1", tableId: "a" },
  { at: 1140, kind: "status-change", tableId: "a", to: "dirty" },
  { at: 1146, kind: "status-change", tableId: "a", to: "ready" },
  { at: 1148, kind: "status-change", tableId: "a", to: "available" },
  { at: 1192, kind: "departed", partyId: "p3", tableId: "c" },
];

describe("eventIndexAt", () => {
  it("counts events at or before the minute, matching a linear scan", () => {
    const events = simulateService({
      tables: TABLES,
      openMinute: OPEN,
      closeMinute: CLOSE,
      profile: "friday",
      seed: 5,
    });
    for (let m = 0; m <= 1500; m += 7) {
      expect(eventIndexAt(events, m)).toBe(events.filter((e) => e.at <= m).length);
    }
    expect(eventIndexAt(events, 0.5)).toBe(events.filter((e) => e.at <= 0.5).length);
  });
});

describe("rehearsalStateAt", () => {
  it("walks the table cycle occupied, dirty, ready, available", () => {
    const cycle = (m: number) => rehearsalStateAt(HAND, m).tableCycle.get("a");
    expect(cycle(1079)).toBeUndefined();
    expect(cycle(1080)).toBe("occupied");
    expect(cycle(1140)).toBe("dirty");
    expect(cycle(1146)).toBe("ready");
    expect(cycle(1148)).toBe("available");
  });

  it("tracks parties, waiting list and counts", () => {
    const at1105 = rehearsalStateAt(HAND, 1105);
    expect(at1105.counts).toEqual({ booked: 0, seated: 1, covers: 2, waiting: 1 });
    expect(at1105.waiting).toEqual([{ partyId: "p3", size: 3, sinceAt: 1100 }]);
    expect(at1105.parties.get("p2")?.phase).toBe("no-show");
    expect(at1105.lastEvent?.kind).toBe("no-show");

    const at1112 = rehearsalStateAt(HAND, 1112);
    expect(at1112.waiting).toEqual([]);
    expect(at1112.counts).toEqual({ booked: 0, seated: 2, covers: 5, waiting: 0 });
    expect(at1112.parties.get("p3")?.phase).toBe("seated");
  });

  it("clamps the minute and tolerates one before open", () => {
    expect(rehearsalStateAt(HAND, -50).counts).toEqual({
      booked: 0,
      seated: 0,
      covers: 0,
      waiting: 0,
    });
    expect(rehearsalStateAt(HAND, 5000, 1100).counts.seated).toBe(1);
    expect(rehearsalStateAt(HAND, 5000).parties.get("p3")?.phase).toBe("finished");
  });

  it("does not mutate its input", () => {
    const frozen = HAND.map((e) => Object.freeze({ ...e })) as RehearsalEvent[];
    Object.freeze(frozen);
    expect(() => rehearsalStateAt(frozen, 1200)).not.toThrow();
    expect(frozen).toEqual(HAND);
  });

  it("returns an empty state for no events", () => {
    const s = rehearsalStateAt([], 600);
    expect(s.counts).toEqual({ booked: 0, seated: 0, covers: 0, waiting: 0 });
    expect(s.lastEvent).toBeNull();
  });

  it("foldEvents(events, n) equals folding the first n events", () => {
    expect(foldEvents(HAND, 6)).toEqual(rehearsalStateAt(HAND, 1112));
  });
});

const ROOM: readonly RehearsalTable[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${String(i).padStart(2, "0")}`,
  name: `R${i}`,
  capacity: i < 5 ? 2 : i < 10 ? 4 : 6,
  minCovers: i < 5 ? 1 : i < 10 ? 2 : 3,
  maxCovers: null,
}));

describe("reviewed snapshots for seed 11 (SC-3)", () => {
  const events = simulateService({
    tables: ROOM,
    openMinute: OPEN,
    closeMinute: CLOSE,
    profile: "friday",
    seed: 11,
  });
  const snap = (m: number) => {
    const s = rehearsalStateAt(events, m, CLOSE);
    return {
      counts: s.counts,
      waiting: s.waiting.length,
      cycle: Object.fromEntries([...s.tableCycle].sort()),
    };
  };

  it("matches the reviewed state at open, 18:00, 19:30, 21:00 and close", () => {
    expect([OPEN, 18 * 60, 19 * 60 + 30, 21 * 60, CLOSE].map(snap)).toMatchInlineSnapshot(`
      [
        {
          "counts": {
            "booked": 10,
            "covers": 0,
            "seated": 0,
            "waiting": 0,
          },
          "cycle": {},
          "waiting": 0,
        },
        {
          "counts": {
            "booked": 10,
            "covers": 16,
            "seated": 5,
            "waiting": 0,
          },
          "cycle": {
            "r00": "occupied",
            "r01": "occupied",
            "r05": "occupied",
            "r09": "occupied",
            "r11": "occupied",
          },
          "waiting": 0,
        },
        {
          "counts": {
            "booked": 4,
            "covers": 31,
            "seated": 10,
            "waiting": 0,
          },
          "cycle": {
            "r00": "occupied",
            "r01": "occupied",
            "r02": "occupied",
            "r03": "occupied",
            "r04": "occupied",
            "r05": "occupied",
            "r06": "occupied",
            "r07": "occupied",
            "r08": "occupied",
            "r09": "available",
            "r10": "occupied",
            "r11": "dirty",
          },
          "waiting": 0,
        },
        {
          "counts": {
            "booked": 3,
            "covers": 13,
            "seated": 4,
            "waiting": 0,
          },
          "cycle": {
            "r00": "occupied",
            "r01": "available",
            "r02": "available",
            "r03": "available",
            "r04": "available",
            "r05": "available",
            "r06": "occupied",
            "r07": "dirty",
            "r08": "occupied",
            "r09": "dirty",
            "r10": "available",
            "r11": "occupied",
          },
          "waiting": 0,
        },
        {
          "counts": {
            "booked": 0,
            "covers": 0,
            "seated": 0,
            "waiting": 0,
          },
          "cycle": {
            "r00": "available",
            "r01": "available",
            "r02": "available",
            "r03": "available",
            "r04": "available",
            "r05": "available",
            "r06": "available",
            "r07": "available",
            "r08": "available",
            "r09": "available",
            "r10": "dirty",
            "r11": "available",
          },
          "waiting": 0,
        },
      ]
    `);
  });
});

describe("rehearsalMetrics", () => {
  const m = rehearsalMetrics(HAND, ["a", "b", "c", "d"]);

  it("sums covers of parties that reached seated", () => {
    expect(m.coversServed).toBe(5);
  });

  it("averages turn minutes over finished parties", () => {
    // p1: 1080 -> 1140 = 60; p3: 1112 -> 1192 = 80; mean 70.
    expect(m.avgTurnMinutes).toBe(70);
  });

  it("picks the hour with the most covers seated", () => {
    // 17:00 hour (1020-1079): 0 seated; 18:00 hour: p1 (2) at 1080 and p3 (3) at 1112 = 5.
    expect(m.peakHour).toBe(18);
  });

  it("lists tables that were never seated, including ones with no events", () => {
    expect(m.tablesNeverSat).toEqual(["b", "d"]);
  });

  it("reports the longest walk-in wait, or null with no walk-ins", () => {
    expect(m.longestWalkInWaitMinutes).toBe(12);
    expect(rehearsalMetrics([], ["a"]).longestWalkInWaitMinutes).toBeNull();
  });

  it("handles a night with nobody seated", () => {
    const empty = rehearsalMetrics([], ["a"]);
    expect(empty).toEqual({
      coversServed: 0,
      avgTurnMinutes: null,
      peakHour: null,
      tablesNeverSat: ["a"],
      longestWalkInWaitMinutes: null,
    });
  });

  it("covers served equals the sum of sizes of seated parties on a simulated night", () => {
    const events = simulateService({
      tables: TABLES,
      openMinute: OPEN,
      closeMinute: CLOSE,
      profile: "friday",
      seed: 3,
    });
    const expected = events.reduce((sum, e) => (e.kind === "seated" ? sum + e.size : sum), 0);
    expect(
      rehearsalMetrics(
        events,
        TABLES.map((t) => t.id)
      ).coversServed
    ).toBe(expected);
  });
});
