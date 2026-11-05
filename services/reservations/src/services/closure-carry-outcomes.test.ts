import { describe, expect, it, vi } from "vitest";

vi.mock("./database.js", () => ({ prisma: {} }));

const { rekey, carryOutcomes, returnCarriedOutcomes } = await import("./closure-carry-outcomes.js");

/** Minimal `tx` stub: `$executeRaw` as a tagged-template mock, `closureOutcome.findMany` stubbed. */
function tx(findManyResult: Array<{ id: string }> = []) {
  return {
    $executeRaw: vi.fn(async (..._args: unknown[]) => 0),
    closureOutcome: { findMany: vi.fn(async () => findManyResult) },
  };
}
type Tx = ReturnType<typeof tx>;
const asDb = (db: Tx) => db as never;

/** `Prisma.join(chunk)` lands as the second value arg, a `_Sql` whose `.values` is the chunk. */
const idsOf = (call: unknown[]) => (call[2] as { values: string[] }).values;

describe("rekey", () => {
  it("issues zero statements for an empty ids list", async () => {
    const db = tx();
    await rekey(asDb(db), [], "rule-new");
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("issues one statement for a single id", async () => {
    const db = tx();
    await rekey(asDb(db), ["o-1"], "rule-new");
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [call] = db.$executeRaw.mock.calls;
    expect(call![1]).toBe("rule-new");
    expect(idsOf(call!)).toEqual(["o-1"]);
  });

  it("issues one statement for exactly CHUNK (5000) ids", async () => {
    const db = tx();
    const ids = Array.from({ length: 5000 }, (_, i) => `o-${i}`);
    await rekey(asDb(db), ids, "rule-new");
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(idsOf(db.$executeRaw.mock.calls[0]!)).toHaveLength(5000);
  });

  it("splits into two statements at 5001 ids: 5000 then 1", async () => {
    const db = tx();
    const ids = Array.from({ length: 5001 }, (_, i) => `o-${i}`);
    await rekey(asDb(db), ids, "rule-new");
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
    expect(idsOf(db.$executeRaw.mock.calls[0]!)).toHaveLength(5000);
    expect(idsOf(db.$executeRaw.mock.calls[1]!)).toHaveLength(1);
  });
});

describe("carryOutcomes", () => {
  it("excludes reservations in `deciding` from the moved set", async () => {
    const db = tx([{ id: "o-1" }]);
    await carryOutcomes(asDb(db), "venue-1", "rule-old", "rule-new", ["res-deciding"]);
    expect(db.closureOutcome.findMany).toHaveBeenCalledWith({
      where: {
        venueId: "venue-1",
        dateRuleId: "rule-old",
        reservationId: { notIn: ["res-deciding"] },
      },
      select: { id: true },
    });
  });

  it("returns null and rekeys nothing when nothing moves", async () => {
    const db = tx([]);
    const result = await carryOutcomes(asDb(db), "venue-1", "rule-old", "rule-new", []);
    expect(result).toBeNull();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("rekeys the found outcomes onto `to` and returns what moved", async () => {
    const db = tx([{ id: "o-1" }, { id: "o-2" }]);
    const result = await carryOutcomes(asDb(db), "venue-1", "rule-old", "rule-new", []);
    expect(result).toEqual({ from: "rule-old", outcomeIds: ["o-1", "o-2"] });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [call] = db.$executeRaw.mock.calls;
    expect(call![1]).toBe("rule-new");
    expect(idsOf(call!)).toEqual(["o-1", "o-2"]);
  });
});

describe("returnCarriedOutcomes", () => {
  it("no-ops without throwing when the inverse carries no closure.carried payload", async () => {
    const db = tx();
    await expect(returnCarriedOutcomes(asDb(db), { closure: {} })).resolves.toBeUndefined();
    await expect(returnCarriedOutcomes(asDb(db), null)).resolves.toBeUndefined();
    await expect(returnCarriedOutcomes(asDb(db), undefined)).resolves.toBeUndefined();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("rekeys the carried outcomes back onto carried.from", async () => {
    const db = tx();
    const inverse = { closure: { carried: { from: "rule-old", outcomeIds: ["o-1", "o-2"] } } };
    await returnCarriedOutcomes(asDb(db), inverse);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [call] = db.$executeRaw.mock.calls;
    expect(call![1]).toBe("rule-old");
    expect(idsOf(call!)).toEqual(["o-1", "o-2"]);
  });
});
