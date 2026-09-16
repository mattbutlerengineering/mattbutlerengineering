import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { getCurrentVenueId } from "./venue-context-store.js";

/** A Prisma model delegate — its query methods, keyed by name. */
type DynamicDelegate = Record<string, (...args: unknown[]) => unknown>;

/**
 * A Prisma client/transaction-client viewed dynamically: `$executeRaw` (used
 * by `setVenueContext`) plus model delegates keyed by name. Real Prisma
 * client types don't expose a string index signature (each model is a
 * distinctly-named, distinctly-typed property), so this wrapper — which by
 * construction accesses a model delegate by a runtime string, not a known
 * key — casts to this shape at the one point it needs dynamic access,
 * rather than trying to force the real generated types through a generic.
 */
type DynamicTransactionClient = Record<string, DynamicDelegate> & {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};

/**
 * Wraps the Prisma client so every model-delegate method call
 * (`prisma.table.findMany(...)`, `prisma.reservation.create(...)`, etc.)
 * automatically runs inside a fresh `$transaction` that issues
 * `setVenueContext` (ADR-026 §4's `set_config`) as the transaction's first
 * statement, using the current request's venue id (`getCurrentVenueId`,
 * ADR-026 part 6). This is what makes the venue-context preHandler's
 * stashed id actually reach the RLS-enabled tables' queries — see
 * `../middleware/venue-context.ts`'s doc comments for the bug this fixes
 * (a bare call against the un-transacted singleton evaporates the setting
 * before the query runs).
 *
 * Top-level `$`-prefixed methods (`$transaction`, `$queryRaw`, `$executeRaw`,
 * `$connect`, `$disconnect`, `$extends`, ...) pass through UNWRAPPED, for two
 * reasons: (1) `setVenueContext` itself calls `$executeRaw` on whatever
 * client it's given — wrapping `$executeRaw` here would recurse into this
 * same wrapper; (2) an explicit `prisma.$transaction(async (tx) => ...)`
 * call site already manages its own transaction boundary and must call
 * `setVenueContext(tx, ...)` itself — a handful of existing call sites do
 * this explicitly (`reservation.ts`, `floor-plan.ts`, `book-slot.ts`,
 * `waitlist.ts`), since they bypass this per-call auto-wrap by construction.
 *
 * Only actually scopes anything when `getCurrentVenueId()` resolves to a
 * real id; a `null`/missing venue id (no request context, e.g. a background
 * job, or a public/unauthenticated route) still opens the same transaction
 * shape, but `setVenueContext` no-ops on it (ADR-026 §4 default-deny).
 */
export function withVenueScopedQueries(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || prop.startsWith("$")) {
        return Reflect.get(target, prop, receiver);
      }

      const delegate: unknown = Reflect.get(target, prop, receiver);
      if (delegate === null || typeof delegate !== "object") {
        return delegate;
      }

      const modelName = prop;
      return new Proxy(delegate as DynamicDelegate, {
        get(delegateTarget, methodProp, methodReceiver) {
          const method = Reflect.get(delegateTarget, methodProp, methodReceiver);
          if (typeof method !== "function") {
            return method;
          }

          return (...args: unknown[]) =>
            target.$transaction(async (tx) => {
              const dynamicTx = tx as unknown as DynamicTransactionClient;
              await setVenueContext(dynamicTx, getCurrentVenueId());
              // Non-null: the outer trap already confirmed `methodProp` is a
              // function on the (non-transacted) delegate for `modelName`;
              // the transaction client's delegate has the identical shape.
              const txMethod = dynamicTx[modelName]![methodProp as string]!;
              return txMethod(...args);
            });
        },
      });
    },
  });
}
