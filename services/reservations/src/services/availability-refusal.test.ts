import { describe, expect, it, vi } from "vitest";
import type { StoreClient } from "./availability-config.js";
import { inAvailabilityTransaction, refuse, Refused } from "./availability-refusal.js";

vi.mock("../middleware/venue-context.js", () => ({ setVenueContext: vi.fn() }));

const clientOf = (): StoreClient =>
  ({
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({}),
  }) as unknown as StoreClient;

describe("availability refusal", () => {
  it("refuse throws a Refused carrying the outcome", () => {
    expect(() => refuse({ kind: "forbidden" })).toThrow(Refused);
    try {
      refuse({ kind: "closure_exists" });
    } catch (error) {
      expect(error).toBeInstanceOf(Refused);
      expect((error as Refused).outcome).toEqual({ kind: "closure_exists" });
    }
  });

  it("types the Refused constructor as an AvailabilityRefusal", () => {
    // @ts-expect-error a kind no command can produce must not compile (it would reach sendRefusal as `any`)
    const stray = new Refused({ kind: "rule_exists" });
    const known: Refused = new Refused({ kind: "closure_exists" });
    expect(stray.outcome.kind).toBe("rule_exists");
    expect(known.outcome).toEqual({ kind: "closure_exists" });
  });

  it("inAvailabilityTransaction returns the work's result when nothing is refused", async () => {
    const result = await inAvailabilityTransaction(clientOf(), "v1", async () => ({ ok: 1 }));
    expect(result).toEqual({ ok: 1 });
  });

  it("inAvailabilityTransaction answers a refusal as the outcome", async () => {
    const result = await inAvailabilityTransaction(clientOf(), "v1", async () =>
      refuse({ kind: "not_found" })
    );
    expect(result).toEqual({ kind: "not_found" });
  });

  it("inAvailabilityTransaction rethrows anything that is not a refusal", async () => {
    await expect(
      inAvailabilityTransaction(clientOf(), "v1", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
