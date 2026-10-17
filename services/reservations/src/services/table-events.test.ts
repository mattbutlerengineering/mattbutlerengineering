import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "../generated/prisma/index.js";
import { recordTableEvent, staffTableActor, SYSTEM_TABLE_ACTOR } from "./table-events.js";

function mockTx() {
  const create = vi.fn().mockResolvedValue({ id: "e1" });
  return { tx: { tableEvent: { create } } as unknown as Prisma.TransactionClient, create };
}

describe("table-events", () => {
  it("staffTableActor is the staff user, or the system actor with no user", () => {
    expect(staffTableActor("u1")).toEqual({ type: "staff", id: "u1" });
    expect(staffTableActor(undefined)).toBe(SYSTEM_TABLE_ACTOR);
    expect(SYSTEM_TABLE_ACTOR).toEqual({ type: "system", id: null });
  });

  it("appends one row through the transaction client", async () => {
    const { tx, create } = mockTx();
    await recordTableEvent(tx, {
      tableId: "t1",
      venueId: "v1",
      fromStatus: "AVAILABLE",
      toStatus: "OCCUPIED",
      actor: { type: "staff", id: "u1" },
      reservationId: "r1",
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        tableId: "t1",
        venueId: "v1",
        fromStatus: "AVAILABLE",
        toStatus: "OCCUPIED",
        actorType: "staff",
        actorId: "u1",
        reservationId: "r1",
      },
    });
  });

  it("leaves reservationId null when the transition has no reservation", async () => {
    const { tx, create } = mockTx();
    await recordTableEvent(tx, {
      tableId: "t1",
      venueId: "v1",
      fromStatus: "OCCUPIED",
      toStatus: "DIRTY",
      actor: SYSTEM_TABLE_ACTOR,
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      reservationId: null,
      actorType: "system",
      actorId: null,
    });
  });

  it("writes nothing for a table with no venue (a NULL-venue row cannot pass RLS)", async () => {
    const { tx, create } = mockTx();
    const result = await recordTableEvent(tx, {
      tableId: "t1",
      venueId: null,
      fromStatus: "AVAILABLE",
      toStatus: "OCCUPIED",
      actor: SYSTEM_TABLE_ACTOR,
    });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
