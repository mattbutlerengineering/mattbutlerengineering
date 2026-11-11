import { describe, expect, it, vi, beforeEach } from "vitest";

const calls: string[] = [];
const tx = { reservationEvent: { create: vi.fn(async () => (calls.push("create"), {})) } };

vi.mock("./database.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    reservationEvent: { findMany: vi.fn() },
  },
}));
vi.mock("../middleware/venue-context.js", () => ({
  setVenueContext: vi.fn(async () => {
    calls.push("setVenueContext");
  }),
}));

import { prisma } from "./database.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { countGuestSignals, recordGuestSignal } from "./guest-signal.js";

describe("recordGuestSignal", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it("sets the venue context before inserting the event (explicit $transaction is unscoped)", async () => {
    await recordGuestSignal({
      reservationId: "res_1",
      venueId: "venue_1",
      guestId: "guest_1",
      kind: "running-late",
      minutes: 15,
    });
    expect(setVenueContext).toHaveBeenCalledWith(tx, "venue_1");
    expect(calls).toEqual(["setVenueContext", "create"]);
    expect(tx.reservationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationId: "res_1",
        venueId: "venue_1",
        kind: "guest_signal",
        actorType: "guest",
        toState: { signal: "running-late", minutes: 15 },
      }),
    });
  });
});

describe("countGuestSignals", () => {
  it("counts late and arrived signals separately", async () => {
    vi.mocked(prisma.reservationEvent.findMany).mockResolvedValueOnce([
      { toState: { signal: "running-late", minutes: 5 } },
      { toState: { signal: "running-late", minutes: 15 } },
      { toState: { signal: "arrived" } },
      { toState: null },
    ] as never);
    expect(await countGuestSignals("res_1")).toEqual({ late: 2, arrived: 1 });
  });
});
