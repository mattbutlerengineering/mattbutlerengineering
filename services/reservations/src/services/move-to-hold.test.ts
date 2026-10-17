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

import { moveReservationToHold } from "./move-to-hold.js";
import { prisma } from "./database.js";
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

const reservation = { id: "res-1", status: "CONFIRMED" } as Reservation;

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
});
