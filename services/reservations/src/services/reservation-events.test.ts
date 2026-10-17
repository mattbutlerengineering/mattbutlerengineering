import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "../generated/prisma/index.js";
import {
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
