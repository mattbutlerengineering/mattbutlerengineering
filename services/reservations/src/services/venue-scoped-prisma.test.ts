import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { withVenueScopedQueries, RLS_MODELS } from "./venue-scoped-prisma.js";
import { enterVenueContext } from "./venue-context-store.js";
import { setRlsTripwireLogger, RlsUnscopedQueryError } from "./rls-context-mode.js";
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

  it("passes $-prefixed methods straight through, unwrapped (still invokes the real $transaction)", async () => {
    // Bound to `target` (see the regression test below), so no longer the
    // exact same function reference as the raw mock — but must still
    // delegate to it unmodified.
    const { client, $transaction } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    await wrapped.$transaction(async () => "result");

    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("binds pass-through $-prefixed methods to the real client, not the Proxy (regression, #5418)", () => {
    // Reproduces the exact shape of Prisma's real `$transaction`/`$connect`/
    // etc.: an internal method that reads its own state off `this`. Calling
    // it as `wrapped.$whoAmI()` must resolve `this` to the raw client —
    // JS method-call semantics otherwise bind `this` to whatever sits left
    // of the dot at the call site, which is the Proxy (`wrapped`) itself.
    const client = {
      $transaction: vi.fn(),
      $whoAmI(this: unknown) {
        return this;
      },
    } as unknown as PrismaClient;
    const wrapped = withVenueScopedQueries(client) as unknown as {
      $whoAmI: () => unknown;
    };

    const result = wrapped.$whoAmI();

    expect(result).toBe(client);
    expect(result).not.toBe(wrapped);
  });

  it("invokes the transaction-scoped delegate method with the correct receiver, not a bare/detached call (regression, #5418)", async () => {
    // Reproduces Prisma's own internal `_tracingHelper` shape: an
    // object whose methods call `this.<sibling method>()`. The buggy
    // implementation hoisted `dynamicTx[modelName][methodProp]` into a
    // local and invoked it bare, which drops `this` to `undefined` (strict
    // mode) and threw "Cannot read properties of undefined (reading
    // 'getTracingHelper')" — the exact Sentry-reported crash.
    enterVenueContext("venue-99");
    const tracingHelper = {
      getTracingHelper() {
        return { isEnabled: () => true };
      },
      isEnabled(this: { getTracingHelper: () => { isEnabled: () => boolean } }) {
        return this.getTracingHelper().isEnabled();
      },
    };
    const txExecuteRaw = vi.fn().mockResolvedValue(0);
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: txExecuteRaw, tracingHelper })
    );
    const client = { $transaction, tracingHelper } as unknown as PrismaClient;
    const wrapped = withVenueScopedQueries(client) as unknown as {
      tracingHelper: { isEnabled: () => Promise<boolean> };
    };

    const result = await wrapped.tracingHelper.isEnabled();

    expect(result).toBe(true);
  });
});

describe("RLS_CONTEXT_MODE tripwire (ADR-026 §3.3 / #5369 PR 1)", () => {
  const ORIGINAL_ENV = process.env.RLS_CONTEXT_MODE;
  const logger = { warn: vi.fn() };

  beforeEach(() => {
    logger.warn.mockClear();
    setRlsTripwireLogger(logger);
  });

  afterEach(() => {
    enterVenueContext(null);
    if (ORIGINAL_ENV === undefined) delete process.env.RLS_CONTEXT_MODE;
    else process.env.RLS_CONTEXT_MODE = ORIGINAL_ENV;
  });

  it("logs rls_unscoped_query for an RLS-scoped model when no venue context is set (warn, the prod default)", async () => {
    delete process.env.RLS_CONTEXT_MODE;
    enterVenueContext(null);
    const { client } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    await wrapped.table.findMany({});

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { model: "table", method: "findMany", route: null },
      "rls_unscoped_query"
    );
  });

  it("does not log when a venue context IS set — this PR must not change behavior for the normal path", async () => {
    enterVenueContext("venue-99");
    const { client } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    await wrapped.table.findMany({});

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not log for a model outside RLS_MODELS, even with no venue context (e.g. venueGroup, which carries no RLS policy)", async () => {
    enterVenueContext(null);
    const venueGroupFindMany = vi.fn().mockResolvedValue([]);
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: vi.fn().mockResolvedValue(0),
        venueGroup: { findMany: venueGroupFindMany },
      })
    );
    const client = { $transaction, venueGroup: { findMany: vi.fn() } } as unknown as PrismaClient;
    const wrapped = withVenueScopedQueries(client) as unknown as {
      venueGroup: { findMany: (args: unknown) => Promise<unknown[]> };
    };
    expect(RLS_MODELS.has("venueGroup")).toBe(false);

    await wrapped.venueGroup.findMany({});

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("throws RlsUnscopedQueryError instead of opening a transaction, in throw mode (for the future sweep suite)", () => {
    process.env.RLS_CONTEXT_MODE = "throw";
    enterVenueContext(null);
    const { client, $transaction } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    expect(() => wrapped.table.findMany({})).toThrow(RlsUnscopedQueryError);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("does not log at all in off mode", async () => {
    process.env.RLS_CONTEXT_MODE = "off";
    enterVenueContext(null);
    const { client } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    await wrapped.table.findMany({});

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("never logs for a $-prefixed passthrough call — the ADR-026 §3.1 cross-venue hatch (app_cross_venue_venues) is invoked via $queryRaw, which bypasses model-delegate wrapping entirely and needs no special-case exemption here", async () => {
    enterVenueContext(null);
    const { client } = createFakeBaseClient();
    const wrapped = withVenueScopedQueries(client);

    await wrapped.$transaction(async () => "result");

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
