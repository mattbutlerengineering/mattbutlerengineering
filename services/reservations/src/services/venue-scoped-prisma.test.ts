import { describe, it, expect, vi, afterEach } from "vitest";
import { withVenueScopedQueries } from "./venue-scoped-prisma.js";
import { enterVenueContext } from "./venue-context-store.js";
import type { PrismaClient } from "../generated/prisma/index.js";

/**
 * Fake base Prisma client: `$transaction` invokes its callback with a fresh
 * `tx` stub carrying its own `$executeRaw` spy plus a `table` delegate whose
 * `findMany` spy is invoked on THAT `tx`, mirroring how a real interactive
 * transaction hands the callback a scoped client. This is what lets these
 * tests prove the transaction boundary itself — see the ADR-026 part 6
 * regression this guards against in `venue-scoped-prisma.ts`'s doc comment.
 */
function createFakeBaseClient() {
  // Bare (non-transacted) delegate methods — must never be invoked directly,
  // only their `tx`-scoped counterparts below.
  const findMany = vi.fn().mockResolvedValue([{ id: "bare-call-table" }]);
  const create = vi.fn().mockResolvedValue({ id: "bare-call-table" });
  let lastTxExecuteRaw: ReturnType<typeof vi.fn> | undefined;
  let lastTxFindMany: ReturnType<typeof vi.fn> | undefined;

  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => {
    const txExecuteRaw = vi.fn().mockResolvedValue(0);
    const txFindMany = vi.fn().mockResolvedValue([{ id: "table-1" }]);
    const txCreate = vi.fn().mockResolvedValue({ id: "table-2" });
    lastTxExecuteRaw = txExecuteRaw;
    lastTxFindMany = txFindMany;
    const tx = {
      $executeRaw: txExecuteRaw,
      table: { findMany: txFindMany, create: txCreate },
    };
    return fn(tx);
  });

  return {
    client: { $transaction, table: { findMany, create } } as unknown as PrismaClient,
    $transaction,
    findMany,
    getLastTxExecuteRaw: () => lastTxExecuteRaw,
    getLastTxFindMany: () => lastTxFindMany,
  };
}

describe("withVenueScopedQueries", () => {
  afterEach(() => {
    enterVenueContext(null);
  });

  it("wraps a model-delegate call in $transaction and runs setVenueContext on the SAME tx before the query", async () => {
    enterVenueContext("venue-99");
    const { client, $transaction, findMany, getLastTxExecuteRaw, getLastTxFindMany } =
      createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    const result = await wrapped.table.findMany({ where: { venueId: "venue-99" } });

    // The bare model call never runs directly — only the transaction's own
    // delegate does. This is the exact bug class the reviewers flagged: a
    // query issued outside the transaction that set app.venue_id.
    expect(findMany).not.toHaveBeenCalled();
    expect($transaction).toHaveBeenCalledTimes(1);

    const txExecuteRaw = getLastTxExecuteRaw();
    const txFindMany = getLastTxFindMany();
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(txFindMany).toHaveBeenCalledWith({ where: { venueId: "venue-99" } });
    expect(result).toEqual([{ id: "table-1" }]);

    // set_config's venue id argument matches the current request context.
    const values = txExecuteRaw?.mock.calls[0]?.slice(1);
    expect(values).toEqual(["venue-99"]);

    // Ordering: setVenueContext must run BEFORE the query on the same tx —
    // both mocks were invoked, and $executeRaw's call index precedes
    // findMany's within the shared $transaction callback invocation order.
    const executeRawOrder = txExecuteRaw?.mock.invocationCallOrder[0] ?? Infinity;
    const findManyOrder = txFindMany?.mock.invocationCallOrder[0] ?? -Infinity;
    expect(executeRawOrder).toBeLessThan(findManyOrder);
  });

  it("does not call setVenueContext's $executeRaw when no venue context is set (default-deny, ADR-026 §4)", async () => {
    enterVenueContext(null);
    const { client, $transaction, getLastTxExecuteRaw } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    await wrapped.table.findMany({});

    // The wrapper still opens the transaction shape even with no venue id —
    // setVenueContext's own no-op-on-null behavior (covered independently in
    // middleware/venue-context.test.ts) is what makes $executeRaw skip.
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(getLastTxExecuteRaw()).not.toHaveBeenCalled();
  });

  it("passes $-prefixed methods straight through, unwrapped", () => {
    const { client, $transaction } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    expect(wrapped.$transaction).toBe($transaction);
  });
});
