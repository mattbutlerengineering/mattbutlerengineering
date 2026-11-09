import { describe, expect, it, vi } from "vitest";
import { holidayDecisionService } from "./holiday-decision.js";

vi.mock("./database.js", () => ({ prisma: {} }));

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const NOW = new Date("2026-11-08T10:00:00.000Z");

const row = (over: Record<string, unknown> = {}) => ({
  id: "hd-1",
  venueId: "venue-1",
  serviceDate: day("2026-11-26"),
  decision: "open_as_usual",
  createdByUserId: "auth0|ana",
  createdAt: NOW,
  ...over,
});

/** A `$transaction` client whose transaction is `tx`, with the venue-context statements stubbed. */
function fakeClient(tx: Record<string, unknown>) {
  const full = {
    $executeRaw: vi.fn(async () => 0),
    $executeRawUnsafe: vi.fn(async () => 0),
    venue: { findUnique: vi.fn(async () => ({ id: "venue-1" })) },
    ...tx,
  };
  return {
    client: {
      $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(full)),
    } as never,
    tx: full,
  };
}

const unknownVenue = { venue: { findUnique: vi.fn(async () => null) } };

describe("holidayDecisionService.list", () => {
  it("reads the range under the venue's context, by date", async () => {
    const findMany = vi.fn(async () => [row()]);
    const { client, tx } = fakeClient({ venueHolidayDecision: { findMany } });

    const rows = await holidayDecisionService.list(
      "venue-1",
      { from: "2026-11-08", to: "2027-11-08" },
      undefined,
      client
    );

    expect(rows).toEqual([
      { serviceDate: "2026-11-26", decision: "open_as_usual", createdAt: NOW.toISOString() },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        venueId: "venue-1",
        serviceDate: { gte: day("2026-11-08"), lte: day("2027-11-08") },
      },
      orderBy: { serviceDate: "asc" },
    });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("skips and logs a row whose decision it does not know, keeping the rest", async () => {
    const findMany = vi.fn(async () => [
      row({ id: "hd-1", serviceDate: day("2026-11-26"), decision: "something_new" }),
      row({ id: "hd-2", serviceDate: day("2026-12-25") }),
    ]);
    const warn = vi.fn();
    const { client } = fakeClient({ venueHolidayDecision: { findMany } });

    const rows = await holidayDecisionService.list(
      "venue-1",
      { from: "2026-11-08", to: "2027-11-08" },
      { warn },
      client
    );

    expect(rows?.map((r) => r.serviceDate)).toEqual(["2026-12-25"]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "venue-1",
        serviceDate: "2026-11-26",
        decision: "something_new",
      }),
      "holiday_decision_row_invalid"
    );
  });

  it("returns null for a venue that does not exist", async () => {
    const findMany = vi.fn();
    const { client } = fakeClient({ ...unknownVenue, venueHolidayDecision: { findMany } });

    expect(
      await holidayDecisionService.list(
        "nope",
        { from: "2026-11-08", to: "2026-11-09" },
        undefined,
        client
      )
    ).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("holidayDecisionService.set", () => {
  it("returns the stored row, so a repeat shows the first time, and records the actor on create", async () => {
    const first = row({ createdAt: new Date("2026-11-01T09:00:00.000Z") });
    const upsert = vi.fn(async () => first);
    const { client } = fakeClient({ venueHolidayDecision: { upsert } });

    const result = await holidayDecisionService.set(
      {
        venueId: "venue-1",
        serviceDate: "2026-11-26",
        decision: "open_as_usual",
        actorId: "auth0|ana",
      },
      client
    );

    expect(result).toEqual({
      serviceDate: "2026-11-26",
      decision: "open_as_usual",
      createdAt: "2026-11-01T09:00:00.000Z",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          venueId: "venue-1",
          serviceDate: day("2026-11-26"),
          decision: "open_as_usual",
          createdByUserId: "auth0|ana",
        },
      })
    );
  });

  it("returns null for a venue that does not exist", async () => {
    const upsert = vi.fn();
    const { client } = fakeClient({ ...unknownVenue, venueHolidayDecision: { upsert } });

    expect(
      await holidayDecisionService.set(
        { venueId: "nope", serviceDate: "2026-11-26", decision: "open_as_usual", actorId: "a" },
        client
      )
    ).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("holidayDecisionService.clear", () => {
  it("deletes by venue and date and succeeds whether or not a row existed", async () => {
    const deleteMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { client } = fakeClient({ venueHolidayDecision: { deleteMany } });

    expect(await holidayDecisionService.clear("venue-1", "2026-11-26", client)).toBe(true);
    expect(await holidayDecisionService.clear("venue-1", "2026-11-26", client)).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", serviceDate: day("2026-11-26") },
    });
  });

  it("returns false for a venue that does not exist", async () => {
    const deleteMany = vi.fn();
    const { client } = fakeClient({ ...unknownVenue, venueHolidayDecision: { deleteMany } });

    expect(await holidayDecisionService.clear("nope", "2026-11-26", client)).toBe(false);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
