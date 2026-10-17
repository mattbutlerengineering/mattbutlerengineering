import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma } from "../generated/prisma/index.js";
vi.mock("./database.js", () => ({
  prisma: { reservationEvent: { findMany: vi.fn() } },
}));

import { prisma } from "./database.js";
import {
  InvalidEventCursorError,
  listForReservation,
  RESERVATION_EVENT_KINDS,
  SYSTEM_ACTOR,
  recordReservationEvent,
  toEventState,
} from "./reservation-events.js";

const row = {
  id: "r1",
  status: "CONFIRMED",
  tableId: "t1",
  date: new Date("2026-10-20T00:00:00.000Z"),
  startTime: new Date("2026-10-20T18:00:00.000Z"),
  endTime: new Date("2026-10-20T19:30:00.000Z"),
  partySize: 4,
  guestName: "Ada Lovelace",
  guestEmail: "ada@example.com",
  guestPhone: "+15550100",
  notes: "allergic to nuts",
} as const;

function mockTx() {
  const create = vi.fn().mockResolvedValue({ id: "e1" });
  return { tx: { reservationEvent: { create } } as unknown as Prisma.TransactionClient, create };
}

describe("reservation-events", () => {
  it("lists every event kind", () => {
    expect(RESERVATION_EVENT_KINDS).toEqual([
      "created",
      "status_changed",
      "cancelled",
      "no_show",
      "moved",
      "updated",
      "deposit_transition",
      "transition_rejected",
    ]);
  });

  it("SYSTEM_ACTOR is the unattributed system actor", () => {
    expect(SYSTEM_ACTOR).toEqual({ type: "system", id: "unattributed" });
  });

  describe("toEventState", () => {
    it("picks only non-PII scheduling fields with ISO strings", () => {
      expect(toEventState(row)).toEqual({
        status: "CONFIRMED",
        tableId: "t1",
        date: "2026-10-20T00:00:00.000Z",
        startTime: "2026-10-20T18:00:00.000Z",
        endTime: "2026-10-20T19:30:00.000Z",
        partySize: 4,
      });
    });

    it("contains no guest PII or notes keys", () => {
      const keys = Object.keys(toEventState(row));
      for (const k of ["guestName", "guestEmail", "guestPhone", "notes"]) {
        expect(keys).not.toContain(k);
      }
    });
  });

  describe("recordReservationEvent", () => {
    it("issues exactly one reservationEvent.create with mapped fields", async () => {
      const { tx, create } = mockTx();
      const to = toEventState(row);
      const result = await recordReservationEvent(tx, {
        reservationId: "r1",
        venueId: "v1",
        kind: "created",
        actor: { type: "staff", id: "u1" },
        to,
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: {
          reservationId: "r1",
          venueId: "v1",
          kind: "created",
          actorType: "staff",
          actorId: "u1",
          fromState: undefined,
          toState: to,
        },
      });
      expect(result).toEqual({ id: "e1" });
    });

    it("stores a null guest actor id as null", async () => {
      const { tx, create } = mockTx();
      await recordReservationEvent(tx, {
        reservationId: "r1",
        venueId: "v1",
        kind: "cancelled",
        actor: { type: "guest", id: null },
      });
      expect(create.mock.calls[0]?.[0].data).toMatchObject({ actorType: "guest", actorId: null });
    });

    it("writes nothing and returns null when venueId is null", async () => {
      const { tx, create } = mockTx();
      const result = await recordReservationEvent(tx, {
        reservationId: "r1",
        venueId: null,
        kind: "created",
        actor: SYSTEM_ACTOR,
      });
      expect(create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});

describe("listForReservation", () => {
  const eventRow = (id: string, createdAt: string) => ({
    id,
    reservationId: "res_1",
    venueId: "venue_1",
    kind: "created",
    actorType: "staff",
    actorId: "user_1",
    fromState: null,
    toState: { status: "CONFIRMED" },
    createdAt: new Date(createdAt),
  });
  const findMany = vi.mocked(prisma.reservationEvent.findMany);

  beforeEach(() => findMany.mockReset());

  it("reads oldest-first, ordered by createdAt then id, defaulting to 50 rows", async () => {
    findMany.mockResolvedValueOnce([]);

    await listForReservation("res_1");

    expect(findMany).toHaveBeenCalledWith({
      where: { reservationId: "res_1" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 51,
    });
  });

  it("maps rows to DTOs with no venue or reservation ids", async () => {
    findMany.mockResolvedValueOnce([eventRow("e1", "2026-10-20T10:00:00.000Z")] as never);

    const result = await listForReservation("res_1");

    expect(result).toEqual({
      data: [
        {
          id: "e1",
          kind: "created",
          actorType: "staff",
          actorId: "user_1",
          fromState: null,
          toState: { status: "CONFIRMED" },
          createdAt: "2026-10-20T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  it("returns a cursor when more rows exist, and resumes strictly after it", async () => {
    findMany.mockResolvedValueOnce([
      eventRow("e1", "2026-10-20T10:00:00.000Z"),
      eventRow("e2", "2026-10-20T10:00:00.000Z"),
      eventRow("e3", "2026-10-20T11:00:00.000Z"),
    ] as never);

    const page = await listForReservation("res_1", { limit: 2 });

    expect(page.data.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(page.nextCursor).toEqual(expect.any(String));

    findMany.mockResolvedValueOnce([]);
    await listForReservation("res_1", { limit: 2, cursor: page.nextCursor! });

    expect(findMany).toHaveBeenLastCalledWith({
      where: {
        reservationId: "res_1",
        OR: [
          { createdAt: { gt: new Date("2026-10-20T10:00:00.000Z") } },
          { createdAt: new Date("2026-10-20T10:00:00.000Z"), id: { gt: "e2" } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 3,
    });
  });

  it("rejects a malformed cursor without querying", async () => {
    await expect(listForReservation("res_1", { cursor: "not-a-cursor" })).rejects.toBeInstanceOf(
      InvalidEventCursorError
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
