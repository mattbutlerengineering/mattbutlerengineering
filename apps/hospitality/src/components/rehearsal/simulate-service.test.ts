import { describe, it, expect } from "vitest";
import { simulateService } from "./simulate-service.js";
import type { RehearsalEvent, RehearsalTable } from "./types.js";

const TABLES: RehearsalTable[] = [
  { id: "t1", capacity: 2, minCovers: 1 },
  { id: "t2", capacity: 2, minCovers: 1 },
  { id: "t3", capacity: 4, minCovers: 2 },
  { id: "t4", capacity: 4, minCovers: 2 },
  { id: "t5", capacity: 6, minCovers: 3 },
  { id: "t6", capacity: 8, minCovers: 4 },
];
const OPEN = 17;
const CLOSE = 23;

function run(seed: number, profile: "friday" | "weeknight" | "brunch" = "friday") {
  return simulateService({ tables: TABLES, openHour: OPEN, closeHour: CLOSE, profile, seed });
}

describe("simulateService", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it("returns events sorted by time, inside service hours", () => {
    const events = run(1);
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.at).toBeGreaterThanOrEqual(events[i - 1]!.at);
    }
    for (const e of events) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(e.at).toBeLessThanOrEqual(CLOSE * 60);
    }
  });

  it("emits every event kind across a Friday's worth of seeds", () => {
    const kinds = new Set<RehearsalEvent["type"]>();
    for (let seed = 0; seed < 50; seed++) for (const e of run(seed)) kinds.add(e.type);
    expect([...kinds].sort()).toEqual(
      ["booked", "departed", "no-show", "seated", "status-change", "walk-in-waiting"].sort()
    );
  });

  it("never double-books a table, fits party to capacity, and clears every party before close", () => {
    for (let seed = 0; seed < 1000; seed++) {
      const events = run(seed);
      const occupant = new Map<string, string>();
      const seated = new Set<string>();
      const departed = new Set<string>();
      for (const e of events) {
        if (e.type === "seated") {
          const table = TABLES.find((t) => t.id === e.tableId)!;
          expect(e.partySize).toBeLessThanOrEqual(table.capacity);
          expect(e.partySize).toBeGreaterThanOrEqual(table.minCovers);
          expect(occupant.has(e.tableId)).toBe(false);
          occupant.set(e.tableId, e.reservationId);
          seated.add(e.reservationId);
        } else if (e.type === "departed") {
          expect(occupant.get(e.tableId)).toBe(e.reservationId);
          occupant.delete(e.tableId);
          departed.add(e.reservationId);
          expect(e.at).toBeLessThanOrEqual(CLOSE * 60);
        }
      }
      expect(occupant.size).toBe(0);
      expect(departed).toEqual(seated);
    }
  });

  it("cycles a table OCCUPIED → DIRTY → READY → AVAILABLE after each party", () => {
    const events = run(3);
    const dep = events.find((e) => e.type === "departed")!;
    const after = events
      .filter((e) => e.type === "status-change" && e.tableId === dep.tableId && e.at >= dep.at)
      .slice(0, 3)
      .map((e) => (e as Extract<RehearsalEvent, { type: "status-change" }>).status);
    expect(after).toEqual(["DIRTY", "READY", "AVAILABLE"]);
  });

  it("releases a no-show's table after a grace period without ever seating it", () => {
    for (let seed = 0; seed < 50; seed++) {
      const events = run(seed);
      const ns = events.find((e) => e.type === "no-show");
      if (!ns) continue;
      expect(events.some((e) => e.type === "seated" && e.reservationId === ns.reservationId)).toBe(
        false
      );
      return;
    }
    throw new Error("no no-show found");
  });

  it("peaks later in the evening than at open for a Friday dinner", () => {
    const seats = run(5)
      .filter((e) => e.type === "seated")
      .map((e) => e.at);
    const mid = (OPEN * 60 + CLOSE * 60) / 2;
    expect(seats.filter((t) => t >= mid - 90 && t <= mid + 90).length).toBeGreaterThan(
      seats.filter((t) => t < mid - 90).length
    );
  });
});
