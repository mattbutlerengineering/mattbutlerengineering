import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./reservation-events.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordReservationEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./book-slot.js", () => ({
  tableAdvisoryLockSql: vi.fn((tableId: string) => ({ lock: tableId })),
}));

vi.mock("./reservation-state-machine.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const original = actual.transitionReservation as (from: string, to: string) => string;
  return { ...actual, transitionReservation: vi.fn(original) };
});

import { applyTransitions, type PlannedTransition } from "./closure-apply.js";
import { recordReservationEvent } from "./reservation-events.js";
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
    reservationEvent: {},
    reservationHold: { findFirst: vi.fn().mockResolvedValue(null) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
}

type Tx = ReturnType<typeof makeTx>;
const apply = (tx: Tx, planned: PlannedTransition[]) =>
  applyTransitions(tx as never, VENUE, ACTOR, planned);

const cancel = (reservationId: string): PlannedTransition => ({
  reservationId,
  action: "cancel",
  movedTo: null,
});
const move = (
  reservationId: string,
  movedTo = new Date("2026-11-01T20:00:00Z")
): PlannedTransition => ({
  reservationId,
  action: "move",
  movedTo,
});

describe("applyTransitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok without touching tx when nothing is cancelled or moved", async () => {
    const tx = makeTx([]);
    const result = await apply(tx, [{ reservationId: "r1", action: "keep_silent", movedTo: null }]);
    expect(result).toEqual({ kind: "ok" });
    expect(tx.reservation.findMany).not.toHaveBeenCalled();
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(recordReservationEvent).not.toHaveBeenCalled();
  });

  describe("cancel", () => {
    it("cancels with the venue_closure reason and records the event", async () => {
      const tx = makeTx([row("r1")]);
      const result = await apply(tx, [cancel("r1")]);
      expect(result).toEqual({ kind: "ok" });
      expect(tx.reservation.updateMany).toHaveBeenCalledWith({
        where: { id: "r1", venueId: VENUE, status: "CONFIRMED" },
        data: expect.objectContaining({ status: "CANCELLED", cancellationReason: "venue_closure" }),
      });
      expect(recordReservationEvent).toHaveBeenCalledTimes(1);
      expect(recordReservationEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          reservationId: "r1",
          venueId: VENUE,
          kind: "cancelled",
          to: expect.objectContaining({ status: "CANCELLED" }),
        })
      );
    });

    it("returns cannot_cancel when the status transition is illegal", async () => {
      const tx = makeTx([row("r1", { status: "COMPLETED" })]);
      const result = await apply(tx, [cancel("r1")]);
      expect(result).toMatchObject({ kind: "cannot_cancel", reservationId: "r1" });
      expect((result as { detail: string }).detail).toEqual(expect.any(String));
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
      expect(recordReservationEvent).not.toHaveBeenCalled();
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
      expect(recordReservationEvent).not.toHaveBeenCalled();
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
        where: { id: "r1", venueId: VENUE, status: "CONFIRMED" },
        data: { startTime: to, endTime: new Date("2026-11-01T21:30:00Z") },
      });
      expect(recordReservationEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ reservationId: "r1", kind: "moved" })
      );
    });

    it("collects a conflict when another booking holds the target window", async () => {
      const tx = makeTx([row("r1")]);
      tx.reservation.findFirst.mockResolvedValue({ id: "other" });
      const result = await apply(tx, [move("r1")]);
      expect(result).toEqual({ kind: "move_conflict", reservationIds: ["r1"] });
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
      expect(recordReservationEvent).not.toHaveBeenCalled();
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

    it("stops at a cannot_cancel and applies nothing after it", async () => {
      const tx = makeTx([row("r1", { status: "COMPLETED" }), row("r2"), row("r3")]);
      const result = await apply(tx, [move("r2"), cancel("r1"), cancel("r3")]);
      expect(result).toMatchObject({ kind: "cannot_cancel", reservationId: "r1" });
      expect(tx.reservation.updateMany).not.toHaveBeenCalled();
      expect(recordReservationEvent).not.toHaveBeenCalled();
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
