import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { simulateService, type RehearsalEvent, type RehearsalTable } from "./simulate-service";
import { mulberry32 } from "./prng";
import { REHEARSAL_PROFILES } from "./profiles";

const OPEN = 17 * 60;
const CLOSE = 23 * 60;

/** A mixed 2/4/6-top room. */
const ROOM: readonly RehearsalTable[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `t2-${i}`,
    name: `Two ${i}`,
    capacity: 2,
    minCovers: 1,
    maxCovers: null,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `t4-${i}`,
    name: `Four ${i}`,
    capacity: 4,
    minCovers: 2,
    maxCovers: null,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `t6-${i}`,
    name: `Six ${i}`,
    capacity: 6,
    minCovers: 3,
    maxCovers: 8,
  })),
];

const run = (seed: number, profile: "friday" | "weeknight" = "friday", tables = ROOM) =>
  simulateService({ tables, openMinute: OPEN, closeMinute: CLOSE, profile, seed });

describe("mulberry32", () => {
  it("repeats for a seed and differs across seeds", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(mulberry32(7)()).not.toBe(mulberry32(8)());
  });

  it("yields floats in [0, 1)", () => {
    const next = mulberry32(123);
    for (let i = 0; i < 1000; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("profiles", () => {
  it("carries the fixed rehearsal hours", () => {
    expect(REHEARSAL_PROFILES.friday.openMinute).toBe(17 * 60);
    expect(REHEARSAL_PROFILES.friday.closeMinute).toBe(23 * 60);
    expect(REHEARSAL_PROFILES.weeknight.closeMinute).toBe(22 * 60);
  });
});

describe("simulateService determinism (SC-1)", () => {
  it("returns deeply equal output for identical input", () => {
    expect(run(42)).toEqual(run(42));
    expect(run(42).length).toBeGreaterThan(20);
  });

  it("differs across seeds", () => {
    expect(run(1)).not.toEqual(run(2));
  });

  it("does not touch ambient randomness or the clock", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const file of ["simulate-service.ts", "prng.ts", "profiles.ts"]) {
      const source = readFileSync(join(dir, file), "utf-8");
      expect(source, file).not.toMatch(/Math\.random|Date\.now|new Date\(/);
    }
  });
});

describe("simulateService ordering", () => {
  const KIND_ORDER = [
    "booked",
    "walk-in-waiting",
    "no-show",
    "departed",
    "status-change",
    "seated",
  ] as const;

  it("is sorted by time then by the fixed kind order", () => {
    for (const seed of [1, 2, 3, 99]) {
      const events = run(seed);
      for (let i = 1; i < events.length; i += 1) {
        const prev = events[i - 1] as RehearsalEvent;
        const cur = events[i] as RehearsalEvent;
        expect(cur.at).toBeGreaterThanOrEqual(prev.at);
        if (cur.at === prev.at) {
          expect(KIND_ORDER.indexOf(cur.kind)).toBeGreaterThanOrEqual(
            KIND_ORDER.indexOf(prev.kind)
          );
        }
      }
    }
  });
});

describe("simulateService invariants over seeds 1..1000 (SC-2)", () => {
  it("never double-books, always fits the table, always departs by close", () => {
    const byId = new Map(ROOM.map((t) => [t.id, t]));
    for (let seed = 1; seed <= 1000; seed += 1) {
      const events = run(seed);
      const seatedAt = new Map<string, { at: number; tableId: string; size: number }>();
      const intervals = new Map<string, Array<[number, number]>>();
      for (const e of events) {
        expect(e.at).toBeGreaterThanOrEqual(OPEN);
        expect(e.at).toBeLessThanOrEqual(CLOSE);
        if (e.kind === "seated") {
          seatedAt.set(e.partyId, { at: e.at, tableId: e.tableId, size: e.size });
          const table = byId.get(e.tableId) as RehearsalTable;
          expect(e.size).toBeGreaterThanOrEqual(table.minCovers);
          expect(e.size).toBeLessThanOrEqual(Math.min(table.capacity, table.maxCovers ?? Infinity));
        }
        if (e.kind === "departed") {
          const s = seatedAt.get(e.partyId);
          expect(s, `departed without seated, seed ${seed}`).toBeDefined();
          const list = intervals.get(e.tableId) ?? [];
          list.push([(s as { at: number }).at, e.at]);
          intervals.set(e.tableId, list);
          seatedAt.delete(e.partyId);
        }
      }
      expect(seatedAt.size, `seated but never departed, seed ${seed}`).toBe(0);
      for (const list of intervals.values()) {
        const sorted = [...list].sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < sorted.length; i += 1) {
          expect((sorted[i] as [number, number])[0]).toBeGreaterThan(
            (sorted[i - 1] as [number, number])[1]
          );
        }
      }
    }
  });
});

describe("simulateService edge cases", () => {
  it("throws RangeError when the night does not run forward", () => {
    expect(() =>
      simulateService({
        tables: ROOM,
        openMinute: 600,
        closeMinute: 600,
        profile: "friday",
        seed: 1,
      })
    ).toThrow(RangeError);
    expect(() =>
      simulateService({
        tables: ROOM,
        openMinute: 600,
        closeMinute: 500,
        profile: "friday",
        seed: 1,
      })
    ).toThrow(RangeError);
  });

  it("throws RangeError for a non-integer seed", () => {
    expect(() => run(1.5)).toThrow(RangeError);
    expect(() => run(Number.NaN)).toThrow(RangeError);
  });

  it("returns [] for no tables", () => {
    expect(run(1, "friday", [])).toEqual([]);
  });

  it("returns [] when every table is too small for any party", () => {
    const tiny: RehearsalTable[] = [
      { id: "x", name: "Bar stool", capacity: 1, minCovers: 1, maxCovers: null },
    ];
    expect(run(1, "friday", tiny)).toEqual([]);
  });
});

describe("a full Friday night", () => {
  it("contains a walk-in who waits and a no-show for seed 1 on the mixed room", () => {
    const events = run(1);
    expect(events.some((e) => e.kind === "walk-in-waiting")).toBe(true);
    expect(events.some((e) => e.kind === "no-show")).toBe(true);
  });

  it("walk-ins who wait are seated later and bookings stay on the timeline", () => {
    const events = run(1);
    const waiting = events.filter((e) => e.kind === "walk-in-waiting");
    for (const w of waiting) {
      const seat = events.find((e) => e.kind === "seated" && e.partyId === w.partyId);
      expect(seat).toBeDefined();
      expect((seat as RehearsalEvent).at).toBeGreaterThan(w.at);
    }
    expect(events.filter((e) => e.kind === "booked").length).toBeGreaterThan(5);
  });
});
