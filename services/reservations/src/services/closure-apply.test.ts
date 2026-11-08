import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./book-slot.js", () => ({
  tableAdvisoryLockSql: vi.fn((tableId: string) => ({ lock: tableId })),
}));

vi.mock("./reservation-state-machine.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const original = actual.transitionReservation as (from: string, to: string) => string;
  return { ...actual, transitionReservation: vi.fn(original) };
});

import { applyTransitions, type PlannedTransition } from "./closure-apply.js";
import { ReservationTransitionError, transitionReservation } from "./reservation-state-machine.js";

const VENUE = "venue-1";
const ACTOR = "user-1";
const DATE = new Date("2026-11-01T00:00:00Z");

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "CONFIRMED",
    tableId: "table-1",
    date: DATE,
    startTime: new Date("2026-11-01T18:00:00Z"),
    endTime: new Date("2026-11-01T19:30:00Z"),
    partySize: 2,
    ...over,
  };
}

function makeTx(rows: ReturnType<typeof row>[]) {
  return {
    reservation: {
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    reservationEvent: {
      create: vi.fn().mockResolvedValue(undefined),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    reservationHold: { findFirst: vi.fn().mockResolvedValue(null) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
}

type Tx = ReturnType<typeof makeTx>;
const apply = (tx: Tx, planned: PlannedTransition[]) =>
  applyTransitions(tx as never, VENUE, ACTOR, planned);

const EXPECTED_START = new Date("2026-11-01T18:00:00Z");

const cancel = (reservationId: string): PlannedTransition => ({
  reservationId,
  action: "cancel",
  movedTo: null,
  expectedStartTime: EXPECTED_START,
});
const move = (
  reservationId: string,
  movedTo = new Date("2026-11-01T20:00:00Z")
): PlannedTransition => ({
  reservationId,
  action: "move",
  movedTo,
  expectedStartTime: EXPECTED_START,
});

describe("applyTransitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok without touching tx when nothing is cancelled or moved", async () => {
    const tx = makeTx([]);
    const result = await apply(tx, [
      {
        reservationId: "r1",
        action: "keep_silent",
        movedTo: null,
        expectedStartTime: EXPECTED_START,
      },
    ]);
    expect(result).toEqual({ kind: "ok" });
    expect(tx.reservation.findMany).not.toHaveBeenCalled();
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
  });

  describe("cancel", () => {
    it("cancels with the venue_closure reason and records the event", async () => {
      const tx = makeTx([row("r1")]);
      const result = await apply(tx, [cancel("r1")]);
      expect(result).toEqual({ kind: "ok" });
      expect(tx.reservation.updateMany).toHaveBeenCalledWith({
        where: { id: "r1", venueId: VENUE, status: "CONFIRMED", startTime: EXPECTED_START },
        data: expect.objectContaining({ status: "CANCELLED", cancellationReason: "venue_closure" }),
      });
      expect(tx.reservationEvent.create).not.toHaveBeenCalled();
      expect(tx.reservationEvent.createMany).toHaveBeenCalledTimes(1);
      expect(tx.reservationEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            reservationId: "r1",
            venueId: VENUE,
            kind: "cancelled",
            actorType: "staff",
            actorId: ACTOR,
            toState: expect.objectContaining({ status: "CANCELLED" }),
          }),
        ],
      });
    });

    it("returns cannot_cancel when the status transition is illegal", async () => {
      const tx = makeTx([row("r1", { status: "COMPLETED" })]);
      const result = await apply(tx, [cancel("r1")]);
      expect(result).toMatchObject({ kind: "cannot_cancel", reservationId: "r1" });
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
      expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
    });

    it("propagates errors that are not ReservationTransitionError", async () => {
      vi.mocked(transitionReservation).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const tx = makeTx([row("r1")]);
      await expect(apply(tx, [cancel("r1")])).rejects.toThrow("boom");
    });

    it("throws a ReservationTransitionError for terminal statuses (guards the fixture)", () => {
      expect(() => transitionReservation("COMPLETED", "CANCELLED")).toThrow(
        ReservationTransitionError
      );
    });

    it("returns cannot_cancel without an event when the CAS loses the race", async () => {
      const tx = makeTx([row("r1")]);
      tx.reservation.updateMany.mockResolvedValue({ count: 0 });
      const result = await apply(tx, [cancel("r1")]);
      expect(result).toEqual({
        kind: "cannot_cancel",
        reservationId: "r1",
        detail: "Reservation changed meanwhile",
      });
      expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
    });
  });

  describe("move", () => {
    it("moves into a free window, locking the table first and keeping the length", async () => {
      const tx = makeTx([row("r1")]);
      const to = new Date("2026-11-01T20:00:00Z");
      const result = await apply(tx, [move("r1", to)]);
      expect(result).toEqual({ kind: "ok" });
      expect(tx.$executeRaw).toHaveBeenCalledWith({ lock: "table-1" });
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.reservation.findFirst.mock.invocationCallOrder[0]!
      );
      expect(tx.reservation.updateMany).toHaveBeenCalledWith({
        where: { id: "r1", venueId: VENUE, status: "CONFIRMED", startTime: EXPECTED_START },
        data: { startTime: to, endTime: new Date("2026-11-01T21:30:00Z") },
      });
      expect(tx.reservationEvent.create).not.toHaveBeenCalled();
      expect(tx.reservationEvent.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ reservationId: "r1", kind: "moved" })],
      });
    });

    it("collects a conflict when another booking holds the target window", async () => {
      const tx = makeTx([row("r1")]);
      tx.reservation.findFirst.mockResolvedValue({ id: "other" });
      const result = await apply(tx, [move("r1")]);
      expect(result).toEqual({ kind: "move_conflict", reservationIds: ["r1"] });
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
      expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
    });

    it("collects a conflict when an active hold covers the target window", async () => {
      const tx = makeTx([row("r1")]);
      tx.reservationHold.findFirst.mockResolvedValue({ id: "hold" });
      const result = await apply(tx, [move("r1")]);
      expect(result).toEqual({ kind: "move_conflict", reservationIds: ["r1"] });
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
    });

    it("lists every conflicting reservation", async () => {
      const tx = makeTx([row("r1"), row("r2", { tableId: "table-2" })]);
      tx.reservation.findFirst.mockResolvedValue({ id: "other" });
      const result = await apply(tx, [move("r1"), move("r2")]);
      expect(result).toEqual({ kind: "move_conflict", reservationIds: ["r1", "r2"] });
      expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
    });

    it("skips the target check for a reservation with no table", async () => {
      const tx = makeTx([row("r1", { tableId: null })]);
      tx.reservation.findFirst.mockResolvedValue({ id: "other" });
      const result = await apply(tx, [move("r1")]);
      expect(result).toEqual({ kind: "ok" });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.reservation.findFirst).not.toHaveBeenCalled();
      expect(tx.reservationHold.findFirst).not.toHaveBeenCalled();
      expect(tx.reservation.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("ordering", () => {
    it("applies cancels before moves regardless of input order", async () => {
      const tx = makeTx([row("r1"), row("r2", { tableId: "table-2" })]);
      await apply(tx, [move("r1"), cancel("r2")]);
      const calls = tx.reservation.updateMany.mock.calls.map(([arg]) => arg.where.id);
      expect(calls).toEqual(["r2", "r1"]);
    });

    it("batches every affected reservation's event into one createMany call", async () => {
      const tx = makeTx([
        row("r1"),
        row("r2", { tableId: "table-2" }),
        row("r3", { tableId: "table-3" }),
      ]);
      const result = await apply(tx, [move("r1"), cancel("r2"), move("r3")]);
      expect(result).toEqual({ kind: "ok" });
      expect(tx.reservationEvent.create).not.toHaveBeenCalled();
      expect(tx.reservationEvent.createMany).toHaveBeenCalledTimes(1);
      const [{ data }] = tx.reservationEvent.createMany.mock.calls[0]!;
      expect(data).toHaveLength(3);
      expect(data.map((e: { reservationId: string }) => e.reservationId).sort()).toEqual([
        "r1",
        "r2",
        "r3",
      ]);
    });

    it("stops at a cannot_cancel and applies nothing after it", async () => {
      const tx = makeTx([row("r1", { status: "COMPLETED" }), row("r2"), row("r3")]);
      const result = await apply(tx, [move("r2"), cancel("r1"), cancel("r3")]);
      expect(result).toMatchObject({ kind: "cannot_cancel", reservationId: "r1" });
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
      expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
    });

    it("silently skips a planned reservation that was not found", async () => {
      const tx = makeTx([row("r2")]);
      const result = await apply(tx, [cancel("missing"), cancel("r2")]);
      expect(result).toEqual({ kind: "ok" });
      expect(tx.reservation.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.reservation.updateMany.mock.calls[0]![0].where.id).toBe("r2");
    });
  });
});

const PLANNED_START = new Date("2030-06-04T21:30:00.000Z");
const STAFF_MOVED_START = new Date("2030-06-04T19:00:00.000Z");

/** A reservation row as the closure tx reads it. */
const raceRow = (startTime: Date) => ({
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
function makeRaceTx(current: ReturnType<typeof raceRow>) {
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
    reservationEvent: {
      create: vi.fn().mockResolvedValue(undefined),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe("applyTransitions: a staff edit that moved the booking after the impact was computed", () => {
  it("refuses to cancel it and writes no event", async () => {
    const tx = makeRaceTx(raceRow(STAFF_MOVED_START));

    const result = await applyTransitions(tx as never, "venue-1", "actor-1", [
      { reservationId: "res-1", action: "cancel", movedTo: null, expectedStartTime: PLANNED_START },
    ]);

    expect(result).toMatchObject({ kind: "cannot_cancel", reservationId: "res-1" });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "res-1", startTime: PLANNED_START }),
      })
    );
    expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
  });

  it("reports a move conflict instead of overwriting the staff's new time", async () => {
    const tx = makeRaceTx(raceRow(STAFF_MOVED_START));

    const result = await applyTransitions(tx as never, "venue-1", "actor-1", [
      {
        reservationId: "res-1",
        action: "move",
        movedTo: new Date("2030-06-04T20:00:00.000Z"),
        expectedStartTime: PLANNED_START,
      },
    ]);

    expect(result).toEqual({ kind: "move_conflict", reservationIds: ["res-1"] });
    expect(tx.reservationEvent.createMany).not.toHaveBeenCalled();
  });

  it("still cancels a booking that has not moved", async () => {
    const tx = makeRaceTx(raceRow(PLANNED_START));

    const result = await applyTransitions(tx as never, "venue-1", "actor-1", [
      { reservationId: "res-1", action: "cancel", movedTo: null, expectedStartTime: PLANNED_START },
    ]);

    expect(result).toEqual({ kind: "ok" });
  });
});
