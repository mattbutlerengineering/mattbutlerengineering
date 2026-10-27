import { describe, expect, it, vi } from "vitest";
import { applyTransitions } from "./closure-apply.js";

const PLANNED_START = new Date("2030-06-04T21:30:00.000Z");
const STAFF_MOVED_START = new Date("2030-06-04T19:00:00.000Z");

/** A reservation row as the closure tx reads it. */
const row = (startTime: Date) => ({
  id: "res-1",
  status: "CONFIRMED",
  tableId: "table-1",
  date: new Date("2030-06-04T00:00:00.000Z"),
  startTime,
  endTime: new Date(startTime.getTime() + 2 * 60 * 60 * 1000),
  partySize: 2,
});

/**
 * A DB whose updateMany honours the `startTime` filter, so a booking a staff edit moved
 * after the impact was computed no longer matches the planned start.
 */
function makeTx(current: ReturnType<typeof row>) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    reservation: {
      findMany: vi.fn().mockResolvedValue([current]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(async ({ where }: { where: { startTime?: Date } }) => ({
        count: where.startTime && where.startTime.getTime() !== current.startTime.getTime() ? 0 : 1,
      })),
    },
    reservationHold: { findFirst: vi.fn().mockResolvedValue(null) },
    reservationEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("applyTransitions: a staff edit that moved the booking after the impact was computed", () => {
  it("refuses to cancel it and writes no event", async () => {
    const tx = makeTx(row(STAFF_MOVED_START));

    const result = await applyTransitions(tx as never, "venue-1", "actor-1", [
      { reservationId: "res-1", action: "cancel", movedTo: null, expectedStartTime: PLANNED_START },
    ]);

    expect(result).toMatchObject({ kind: "cannot_cancel", reservationId: "res-1" });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "res-1", startTime: PLANNED_START }),
      })
    );
    expect(tx.reservationEvent.create).not.toHaveBeenCalled();
  });

  it("reports a move conflict instead of overwriting the staff's new time", async () => {
    const tx = makeTx(row(STAFF_MOVED_START));

    const result = await applyTransitions(tx as never, "venue-1", "actor-1", [
      {
        reservationId: "res-1",
        action: "move",
        movedTo: new Date("2030-06-04T20:00:00.000Z"),
        expectedStartTime: PLANNED_START,
      },
    ]);

    expect(result).toEqual({ kind: "move_conflict", reservationIds: ["res-1"] });
    expect(tx.reservationEvent.create).not.toHaveBeenCalled();
  });

  it("still cancels a booking that has not moved", async () => {
    const tx = makeTx(row(PLANNED_START));

    const result = await applyTransitions(tx as never, "venue-1", "actor-1", [
      { reservationId: "res-1", action: "cancel", movedTo: null, expectedStartTime: PLANNED_START },
    ]);

    expect(result).toEqual({ kind: "ok" });
  });
});
