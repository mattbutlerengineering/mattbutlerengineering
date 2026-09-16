import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { withRlsBypass } from "./rls-bypass.js";
import type { PrismaClient } from "../generated/prisma/index.js";

/**
 * Fake base Prisma client mirroring `venue-scoped-prisma.test.ts`'s pattern:
 * `$transaction` hands its callback a fresh `tx` stub carrying its own
 * `$executeRaw` spy plus a `guest.findMany` spy invoked on THAT `tx`.
 */
function createFakeClient() {
  const guestFindMany = vi.fn().mockResolvedValue([{ id: "guest-1" }]);
  let lastTxExecuteRaw: ReturnType<typeof vi.fn> | undefined;

  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => {
    const txExecuteRaw = vi.fn().mockResolvedValue(0);
    lastTxExecuteRaw = txExecuteRaw;
    const tx = { $executeRaw: txExecuteRaw, guest: { findMany: guestFindMany } };
    return fn(tx);
  });

  return {
    client: { $transaction } as unknown as PrismaClient,
    $transaction,
    guestFindMany,
    getLastTxExecuteRaw: () => lastTxExecuteRaw,
  };
}

describe("withRlsBypass", () => {
  it("issues SET ROLE app_rls_bypass before, and RESET ROLE after, the callback on the SAME tx", async () => {
    const { client, guestFindMany, getLastTxExecuteRaw } = createFakeClient();

    const result = await withRlsBypass(
      client,
      (tx) => (tx as unknown as { guest: { findMany: () => unknown } }).guest.findMany() as never
    );

    const txExecuteRaw = getLastTxExecuteRaw();
    expect(txExecuteRaw).toHaveBeenCalledTimes(2);
    expect(txExecuteRaw?.mock.calls[0]?.[0]).toEqual(["SET ROLE app_rls_bypass"]);
    expect(txExecuteRaw?.mock.calls[1]?.[0]).toEqual(["RESET ROLE"]);

    // Ordering: SET ROLE before the callback's query, RESET ROLE after.
    const setRoleOrder = txExecuteRaw?.mock.invocationCallOrder[0] ?? Infinity;
    const findManyOrder = guestFindMany.mock.invocationCallOrder[0] ?? -Infinity;
    const resetRoleOrder = txExecuteRaw?.mock.invocationCallOrder[1] ?? -Infinity;
    expect(setRoleOrder).toBeLessThan(findManyOrder);
    expect(findManyOrder).toBeLessThan(resetRoleOrder);

    expect(result).toEqual([{ id: "guest-1" }]);
  });

  it("still issues RESET ROLE when the callback throws, and rethrows", async () => {
    const { client, getLastTxExecuteRaw } = createFakeClient();

    await expect(
      withRlsBypass(client, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const txExecuteRaw = getLastTxExecuteRaw();
    expect(txExecuteRaw).toHaveBeenCalledTimes(2);
    expect(txExecuteRaw?.mock.calls[1]?.[0]).toEqual(["RESET ROLE"]);
  });
});
