import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservationHold: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./assert-bookable.js", () => ({
  judgeBooking: vi.fn().mockResolvedValue({ kind: "ok" }),
}));

import { moveReservationToHold } from "./move-to-hold.js";
import { prisma } from "./database.js";
import { judgeBooking } from "./assert-bookable.js";
import type { Reservation } from "@mbe/types";

const NOW = new Date("2026-05-05T18:00:00Z");
const TEN_MIN_FROM_NOW = new Date(NOW.getTime() + 10 * 60 * 1000);

function makeHold(overrides: Record<string, unknown> = {}) {
  return {
    id: "hold-1",
    venueId: "venue-1",
    tableId: "table-2",
    date: new Date("2026-05-05"),
    startTime: new Date("2026-05-05T22:00:00Z"),
    endTime: new Date("2026-05-05T23:30:00Z"),
    partySize: 4,
    sessionId: "session-abc",
    expiresAt: TEN_MIN_FROM_NOW,
    createdAt: NOW,
    ...overrides,
  };
}

const reservation = {
  id: "res-1",
  status: "CONFIRMED",
  tableId: "table-1",
  date: "2026-05-05T00:00:00.000Z",
  startTime: "2026-05-05T20:00:00.000Z",
  endTime: "2026-05-05T21:30:00.000Z",
  partySize: 2,
  venueId: "venue-1",
} as Reservation;

function makeUpdatedRow(hold: ReturnType<typeof makeHold>) {
  return {
    id: "res-1",
    date: hold.date,
    startTime: hold.startTime,
    endTime: hold.endTime,
    partySize: hold.partySize,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: hold.tableId,
    table: null,
    venueId: hold.venueId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeTx() {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $executeRaw: vi.fn().mockResolvedValue(0),
    venue: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
    reservation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    reservationEvent: { create: vi.fn().mockResolvedValue({ id: "evt-1" }) },
    reservationHold: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function useTx(tx: ReturnType<typeof makeTx>) {
  vi.mocked(prisma.$transaction).mockImplementationOnce((async (
    fn: (t: unknown) => Promise<unknown>
  ) => fn(tx)) as never);
}

const input = { reservation, holdId: "hold-1", sessionId: "session-abc", venueId: "venue-1" };

describe("moveReservationToHold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("moves the reservation onto the hold and deletes the hold, never touching status", async () => {
    const hold = makeHold();
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
    const tx = makeTx();
    tx.reservation.update.mockResolvedValue(makeUpdatedRow(hold));
    useTx(tx);

    const result = await moveReservationToHold(input);

    expect(result.success).toBe(true);
    if (result.success) expect(result.reservation.partySize).toBe(4);
    const arg = tx.reservation.update.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: "res-1" });
    expect(arg.data).toEqual({
      date: hold.date,
      startTime: hold.startTime,
      endTime: hold.endTime,
      tableId: "table-2",
      partySize: 4,
    });
    expect(arg.data).not.toHaveProperty("status");
    expect(tx.reservationHold.delete).toHaveBeenCalledWith({ where: { id: "hold-1" } });
  });

  it("writes notes in the same update when provided", async () => {
    const hold = makeHold();
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
    const tx = makeTx();
    tx.reservation.update.mockResolvedValue(makeUpdatedRow(hold));
    useTx(tx);

    await moveReservationToHold({ ...input, notes: "quiet table" });

    expect(tx.reservation.update.mock.calls[0]![0].data.notes).toBe("quiet table");
  });

  it("excludes the reservation's own slot and the hold from the conflict re-check", async () => {
    const hold = makeHold();
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
    const tx = makeTx();
    tx.reservation.update.mockResolvedValue(makeUpdatedRow(hold));
    useTx(tx);

    await moveReservationToHold(input);

    expect(tx.reservation.findFirst.mock.calls[0]![0].where.tableId).toBe("table-2");
    expect(tx.reservation.findFirst.mock.calls[0]![0].where.id).toEqual({ not: "res-1" });
    expect(tx.reservationHold.findFirst.mock.calls[0]![0].where.id).toEqual({ not: "hold-1" });
  });

  it("does not count the moving reservation against its own pacing window", async () => {
    const hold = makeHold({ partySize: 4 });
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
    const tx = makeTx();
    tx.venue.findUnique.mockResolvedValue({
      settings: { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] },
    });
    // The reservation being moved already sits in the target window (same start).
    tx.reservation.findMany.mockResolvedValue([
      {
        id: "res-1",
        tableId: "table-1",
        startTime: hold.startTime,
        endTime: hold.endTime,
        partySize: 2,
      },
    ]);
    tx.reservation.update.mockResolvedValue(makeUpdatedRow(hold));
    useTx(tx);

    const result = await moveReservationToHold(input);

    expect(result.success).toBe(true);
    expect(tx.reservation.findMany).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a missing hold or another venue's hold without writing", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(null);
    expect(await moveReservationToHold(input)).toMatchObject({
      success: false,
      errorCode: "NOT_FOUND",
    });

    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(
      makeHold({ venueId: "venue-other" }) as never
    );
    expect(await moveReservationToHold(input)).toMatchObject({
      success: false,
      errorCode: "NOT_FOUND",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns SESSION_MISMATCH for a wrong session without writing", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(makeHold() as never);
    const result = await moveReservationToHold({ ...input, sessionId: "other" });
    expect(result).toMatchObject({ success: false, errorCode: "SESSION_MISMATCH" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns EXPIRED and leaves the reservation unchanged", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(
      makeHold({ expiresAt: new Date(NOW.getTime() - 1000) }) as never
    );
    const tx = makeTx();
    useTx(tx);

    const result = await moveReservationToHold(input);

    expect(result).toMatchObject({ success: false, errorCode: "EXPIRED" });
    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it("returns CONFLICT and leaves the reservation unchanged", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(makeHold() as never);
    const tx = makeTx();
    tx.reservation.findFirst.mockResolvedValue({ id: "other-res" });
    useTx(tx);

    const result = await moveReservationToHold(input);

    expect(result).toMatchObject({ success: false, errorCode: "CONFLICT" });
    expect(tx.reservation.update).not.toHaveBeenCalled();
    expect(tx.reservationHold.delete).not.toHaveBeenCalled();
  });

  it("returns NOT_BOOKABLE when the gate refuses the held slot, leaving the reservation unchanged", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(makeHold() as never);
    const rejection = { code: "outside-availability", reason: "closed" } as const;
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "rejected", rejection });
    const tx = makeTx();
    useTx(tx);

    const result = await moveReservationToHold(input);

    expect(result).toMatchObject({ success: false, errorCode: "NOT_BOOKABLE", rejection });
    expect(judgeBooking).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        channel: "online",
        excludeReservationId: "res-1",
        excludeHoldId: "hold-1",
      })
    );
    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it("records one moved event with pre- and post-move state in the move transaction", async () => {
    const hold = makeHold();
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
    const tx = makeTx();
    tx.reservation.update.mockResolvedValue(makeUpdatedRow(hold));
    useTx(tx);

    await moveReservationToHold({ ...input, actor: { type: "guest", id: "guest-1" } });

    expect(tx.reservationEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.reservationEvent.create.mock.calls[0]![0].data).toMatchObject({
      reservationId: "res-1",
      venueId: "venue-1",
      kind: "moved",
      actorType: "guest",
      actorId: "guest-1",
      fromState: {
        status: "CONFIRMED",
        tableId: "table-1",
        date: "2026-05-05T00:00:00.000Z",
        startTime: "2026-05-05T20:00:00.000Z",
        endTime: "2026-05-05T21:30:00.000Z",
        partySize: 2,
      },
      toState: {
        status: "CONFIRMED",
        tableId: "table-2",
        date: hold.date.toISOString(),
        startTime: hold.startTime.toISOString(),
        endTime: hold.endTime.toISOString(),
        partySize: 4,
      },
    });
  });

  it("attributes the move to the system actor when none is given", async () => {
    const hold = makeHold();
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
    const tx = makeTx();
    tx.reservation.update.mockResolvedValue(makeUpdatedRow(hold));
    useTx(tx);

    await moveReservationToHold(input);

    expect(tx.reservationEvent.create.mock.calls[0]![0].data).toMatchObject({
      actorType: "system",
      actorId: "unattributed",
    });
  });

  it("records no event on conflict or expired hold", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(makeHold() as never);
    const conflictTx = makeTx();
    conflictTx.reservation.findFirst.mockResolvedValue({ id: "other-res" });
    useTx(conflictTx);
    await moveReservationToHold(input);
    expect(conflictTx.reservationEvent.create).not.toHaveBeenCalled();

    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(
      makeHold({ expiresAt: new Date(NOW.getTime() - 1000) }) as never
    );
    const expiredTx = makeTx();
    useTx(expiredTx);
    await moveReservationToHold(input);
    expect(expiredTx.reservationEvent.create).not.toHaveBeenCalled();
  });
});
