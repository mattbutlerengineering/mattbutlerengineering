import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("./database.js", () => ({
  prisma: { closureOutcome: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import { loadClosureChanges } from "./closure-changes.js";

const row = (id: string, status: string) => ({
  id,
  venueId: "venue-1",
  tableId: "table-1",
  date: new Date("2030-06-04T00:00:00.000Z"),
  startTime: new Date("2030-06-04T19:00:00.000Z"),
  endTime: new Date("2030-06-04T21:00:00.000Z"),
  partySize: 2,
  status,
  table: null,
  guest: null,
  createdAt: new Date("2030-05-01T00:00:00.000Z"),
  updatedAt: new Date("2030-05-01T00:00:00.000Z"),
});

describe("loadClosureChanges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns one cancelled booking per cancel and one moved booking per move", async () => {
    findMany.mockResolvedValueOnce([
      { action: "cancel", reservation: row("r1", "CANCELLED") },
      { action: "cancel", reservation: row("r2", "CANCELLED") },
      { action: "move", reservation: row("r3", "CONFIRMED") },
    ]);

    const changes = await loadClosureChanges("venue-1", "dr-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: "venue-1", dateRuleId: "dr-1", action: { in: ["cancel", "move"] } },
      })
    );
    expect(changes.cancelled.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(changes.moved.map((r) => r.id)).toEqual(["r3"]);
  });

  it("leaves out a moved booking cancelled since, and a cancel that did not stick", async () => {
    findMany.mockResolvedValueOnce([
      { action: "move", reservation: row("r1", "CANCELLED") },
      { action: "cancel", reservation: row("r2", "CONFIRMED") },
    ]);

    expect(await loadClosureChanges("venue-1", "dr-1")).toEqual({ cancelled: [], moved: [] });
  });
});
