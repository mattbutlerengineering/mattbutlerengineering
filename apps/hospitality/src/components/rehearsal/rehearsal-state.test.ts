import { describe, it, expect } from "vitest";
import { rehearsalStateAt } from "./rehearsal-state.js";
import { simulateService } from "./simulate-service.js";
import type { RehearsalEvent } from "./types.js";

const h = (hour: number, minute = 0) => hour * 60 + minute;

const EVENTS: RehearsalEvent[] = [
  {
    at: h(18),
    type: "booked",
    reservationId: "r1",
    partySize: 2,
    tableId: "t1",
    arrivesAt: h(18, 45),
  },
  { at: h(18, 20), type: "walk-in-waiting", reservationId: "w1", partySize: 4 },
  { at: h(18, 45), type: "seated", reservationId: "r1", partySize: 2, tableId: "t1" },
  { at: h(18, 45), type: "status-change", tableId: "t1", status: "OCCUPIED" },
  { at: h(18, 50), type: "seated", reservationId: "w1", partySize: 4, tableId: "t2" },
  { at: h(18, 50), type: "status-change", tableId: "t2", status: "OCCUPIED" },
  { at: h(20), type: "departed", reservationId: "r1", tableId: "t1" },
  { at: h(20), type: "status-change", tableId: "t1", status: "DIRTY" },
  { at: h(20, 8), type: "status-change", tableId: "t1", status: "READY" },
  { at: h(20, 10), type: "status-change", tableId: "t1", status: "AVAILABLE" },
  {
    at: h(19),
    type: "booked",
    reservationId: "r2",
    partySize: 3,
    tableId: "t3",
    arrivesAt: h(19, 30),
  },
  { at: h(19, 45), type: "no-show", reservationId: "r2", tableId: "t3" },
].sort((a, b) => a.at - b.at) as RehearsalEvent[];

const OPTS = { date: "2026-10-24", tableIds: ["t1", "t2", "t3", "t4"] };

describe("rehearsalStateAt", () => {
  it("is empty before anything happens", () => {
    const s = rehearsalStateAt(EVENTS, h(17), OPTS);
    expect(s.reservations).toEqual([]);
    expect(s.seatedIds.size).toBe(0);
    expect(s.waiting).toEqual([]);
    expect(s.metrics).toMatchObject({ coversServed: 0, averageTurnMinutes: 0, peakHour: null });
  });

  it("shows a booked party as a confirmed reservation and its table as reserved-soon near arrival", () => {
    const early = rehearsalStateAt(EVENTS, h(18), OPTS);
    expect(early.reservations).toHaveLength(1);
    expect(early.reservations[0]).toMatchObject({
      id: "r1",
      partySize: 2,
      tableId: "t1",
      status: "CONFIRMED",
      date: "2026-10-24",
      startTime: "2026-10-24T18:45:00.000Z",
    });
    expect(early.tableStatuses.get("t1")).toBeUndefined();
    const soon = rehearsalStateAt(EVENTS, h(18, 20), OPTS);
    expect(soon.tableStatuses.get("t1")).toBe("reserved-soon");
  });

  it("tracks waiting walk-ins, then seated parties", () => {
    const waiting = rehearsalStateAt(EVENTS, h(18, 30), OPTS);
    expect(waiting.waiting).toEqual([{ reservationId: "w1", partySize: 4, since: h(18, 20) }]);
    expect(waiting.metrics.longestWalkInWaitMinutes).toBe(10);

    const seated = rehearsalStateAt(EVENTS, h(19), OPTS);
    expect(seated.waiting).toEqual([]);
    expect([...seated.seatedIds].sort()).toEqual(["r1", "w1"]);
    expect(seated.tableStatuses.get("t1")).toBe("seated");
    expect(seated.tableStatuses.get("t2")).toBe("seated");
    expect(seated.reservations.map((r) => r.id).sort()).toEqual(["r1", "r2", "w1"]);
    expect(seated.metrics.coversServed).toBe(6);
    expect(seated.metrics.longestWalkInWaitMinutes).toBe(30);
  });

  it("cycles a departed table through needs-bussing back to available", () => {
    expect(rehearsalStateAt(EVENTS, h(20, 1), OPTS).tableStatuses.get("t1")).toBe("needs-bussing");
    expect(rehearsalStateAt(EVENTS, h(20, 9), OPTS).tableStatuses.get("t1")).toBe("available");
    const done = rehearsalStateAt(EVENTS, h(20, 10), OPTS);
    expect(done.tableStatuses.get("t1")).toBe("available");
    expect(done.seatedIds.has("r1")).toBe(false);
    expect(done.reservations.find((r) => r.id === "r1")?.status).toBe("COMPLETED");
    expect(done.metrics.averageTurnMinutes).toBe(75);
  });

  it("marks no-shows and counts tables that never sat", () => {
    const s = rehearsalStateAt(EVENTS, h(21), OPTS);
    expect(s.reservations.find((r) => r.id === "r2")?.status).toBe("NO_SHOW");
    expect(s.metrics.tablesNeverSat).toBe(2);
    expect(s.metrics.peakHour).toBe(18);
  });

  it("is pure: same input, same output, input untouched", () => {
    const copy = structuredClone(EVENTS);
    expect(rehearsalStateAt(EVENTS, h(19), OPTS)).toEqual(rehearsalStateAt(EVENTS, h(19), OPTS));
    expect(EVENTS).toEqual(copy);
  });

  it("ends a full simulated service with nobody seated and every party completed", () => {
    const tables = [
      { id: "a", capacity: 2, minCovers: 1 },
      { id: "b", capacity: 4, minCovers: 2 },
      { id: "c", capacity: 6, minCovers: 3 },
    ];
    const events = simulateService({
      tables,
      openHour: 17,
      closeHour: 23,
      profile: "friday",
      seed: 11,
    });
    const end = rehearsalStateAt(events, h(23), {
      date: "2026-10-24",
      tableIds: tables.map((t) => t.id),
    });
    expect(end.seatedIds.size).toBe(0);
    expect(end.waiting).toEqual([]);
    expect(end.metrics.coversServed).toBeGreaterThan(0);
    expect(end.metrics.averageTurnMinutes).toBeGreaterThan(0);
    for (const status of end.tableStatuses.values()) expect(status).toBe("available");
  });
});
