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
  it("issues SET LOCAL ROLE app_rls_bypass on the tx before running the callback, with a generous transaction timeout", async () => {
    const { client, $transaction, guestFindMany, getLastTxExecuteRaw } = createFakeClient();

    const result = await withRlsBypass(
      client,
      (tx) => (tx as unknown as { guest: { findMany: () => unknown } }).guest.findMany() as never
    );

    const txExecuteRaw = getLastTxExecuteRaw();
    // Only one statement is ever issued -- SET LOCAL reverts automatically
    // when the transaction ends, so there is no paired RESET/undo call.
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw?.mock.calls[0]?.[0]).toEqual(["SET LOCAL ROLE app_rls_bypass"]);

    // Ordering: SET LOCAL ROLE before the callback's query.
    const setRoleOrder = txExecuteRaw?.mock.invocationCallOrder[0] ?? Infinity;
    const findManyOrder = guestFindMany.mock.invocationCallOrder[0] ?? -Infinity;
    expect(setRoleOrder).toBeLessThan(findManyOrder);

    // The default Prisma interactive-transaction timeout (5s) is too tight
    // for a per-venue scan against a large venue -- withRlsBypass must
    // override it explicitly.
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });

    expect(result).toEqual([{ id: "guest-1" }]);
  });

  it("propagates the callback's error without issuing any additional statement", async () => {
    const { getLastTxExecuteRaw, client } = createFakeClient();

    await expect(
      withRlsBypass(client, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    // Nothing to reset on error either -- SET LOCAL's revert happens at
    // ROLLBACK, which Prisma's $transaction issues on its own when the
    // callback throws. If withRlsBypass ever needed a second `$executeRaw`
    // call here (e.g. an explicit RESET ROLE), it would risk running that
    // statement inside an already-aborted transaction and masking this
    // error with a new one -- exactly the failure mode SET LOCAL avoids.
    const txExecuteRaw = getLastTxExecuteRaw();
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("does not leak the elevated role onto a later query on the same underlying client", async () => {
    // SET LOCAL is scoped to the transaction that issued it. A mocked
    // $transaction can't reproduce Postgres's own revert-on-commit
    // behavior, but it CAN prove withRlsBypass never issues a statement
    // outside the transaction it opened -- each call gets its own tx and
    // its own $executeRaw spy, and neither call's tx is reused by the
    // other. The real "does the role actually revert" proof is the
    // real-Postgres assertion in
    // `lapsed-guest-cron.rls.integration.test.ts` ("SET LOCAL ROLE does
    // not persist past the transaction").
    const { client } = createFakeClient();

    const firstTxExecuteRaw = { current: undefined as ReturnType<typeof vi.fn> | undefined };
    await withRlsBypass(client, async (tx) => {
      firstTxExecuteRaw.current = (
        tx as unknown as { $executeRaw: ReturnType<typeof vi.fn> }
      ).$executeRaw;
      return null;
    });

    const secondTxExecuteRaw = { current: undefined as ReturnType<typeof vi.fn> | undefined };
    await withRlsBypass(client, async (tx) => {
      secondTxExecuteRaw.current = (
        tx as unknown as { $executeRaw: ReturnType<typeof vi.fn> }
      ).$executeRaw;
      return null;
    });

    expect(firstTxExecuteRaw.current).not.toBe(secondTxExecuteRaw.current);
    expect(secondTxExecuteRaw.current).toHaveBeenCalledTimes(1);
    expect(secondTxExecuteRaw.current?.mock.calls[0]?.[0]).toEqual([
      "SET LOCAL ROLE app_rls_bypass",
    ]);
  });
});
