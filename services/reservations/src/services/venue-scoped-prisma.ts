import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { getCurrentVenueId } from "./venue-context-store.js";
import { recordUnscopedRlsQuery } from "./rls-context-mode.js";

/**
 * Prisma delegate names (as they appear as `prisma.<delegate>` on the
 * generated client — the model name with its first letter lowercased) for
 * the seven tables ADR-026 §1 lists as RLS-scoped. Cross-checked against
 * `schema.prisma`'s `@@map` names and the migrations' actual
 * `ENABLE ROW LEVEL SECURITY` declarations in `rls-models-coverage.test.ts`,
 * so an eighth RLS table added with no corresponding entry here fails that
 * test instead of silently going unwatched by the tripwire below.
 */
export const RLS_MODELS: ReadonlySet<string> = new Set([
  "venue",
  "floorPlan",
  "table",
  "guest",
  "reservation",
  "deposit",
  "waitlistEntry",
]);

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
 *
 * Two `this`-binding traps to avoid when touching this trap (root cause of
 * the "Cannot read properties of undefined (reading 'getTracingHelper')"
 * production bug this comment documents):
 *
 * 1. A `get` trap that returns `Reflect.get(target, prop, receiver)`
 *    unbound hands back a bare function reference. JS method-call semantics
 *    (`obj.method()`) bind `this` to whatever sits left of the final `.` at
 *    the *call site* — here, the Proxy itself (`receiver`), not `target` —
 *    so every pass-through `$`-prefixed call (e.g. the `prisma.$transaction`
 *    call sites in `reservation.ts`/`floor-plan.ts`/`book-slot.ts`/
 *    `waitlist.ts`/`venue.ts`) re-enters Prisma's internals with `this` set
 *    to this Proxy. Prisma's `$transaction`/`$connect`/etc. read internal
 *    state off `this` (`this._engineConfig`, `this._tracingHelper`, ...), so
 *    every such internal access re-enters THIS trap for a property the
 *    "model delegate" wrapping below was never meant to see. `.bind(target)`
 *    below closes that re-entry path.
 * 2. Extracting a method into a local (`const m = obj[k]; m(...)`) and
 *    calling the local bare loses the receiver the same way — `this` inside
 *    the callee becomes `undefined` (strict mode). Prisma's own internal
 *    `_tracingHelper` object (`getTraceParent`/`isEnabled`/etc., all of
 *    which call `this.getTracingHelper()`) is exactly this shape, which is
 *    what turned a stray internal-property access into that exact crash.
 *    Calling `dynamicTx[modelName]![methodProp](...)` directly (never
 *    hoisting the method reference to a variable first) keeps the implicit
 *    receiver intact.
 */
export function withVenueScopedQueries(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || prop.startsWith("$")) {
        const value: unknown = Reflect.get(target, prop, receiver);
        // Bind pass-through methods to the real client so Prisma's own
        // internal `this.<field>` accesses never re-enter this Proxy with
        // `this` set to the wrapper (see trap 1 above).
        return typeof value === "function" ? value.bind(target) : value;
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

          return (...args: unknown[]) => {
            // ADR-026 §3.3 / #5369 PR 1 tripwire: a model-delegate call on an
            // RLS-scoped table with no venue context resolved is either a
            // known-open gap (ADR-026 §3.2/§3.3) or a genuinely missing
            // `where: { venueId }` filter — either way, worth surfacing. Only
            // `RLS_MODELS` are checked: `venueGroup`/`reservationHold`/
            // `venueMembership` carry no RLS policy at all, so flagging them
            // would be a false positive. In `"throw"` mode (never the prod
            // default) this throws BEFORE opening the transaction below, so
            // the query never runs — see `recordUnscopedRlsQuery`.
            if (RLS_MODELS.has(modelName) && getCurrentVenueId() === null) {
              recordUnscopedRlsQuery({ model: modelName, method: String(methodProp) });
            }

            return target.$transaction(async (tx) => {
              const dynamicTx = tx as unknown as DynamicTransactionClient;
              // `skipUnscopedQueryCheck: true` — this call site already ran
              // the more precise `RLS_MODELS`-gated check above; `setVenueContext`
              // itself is generic over every model (RLS-scoped or not) and
              // cannot tell them apart, so without this flag every non-RLS
              // model call here would also be misreported.
              await setVenueContext(dynamicTx, getCurrentVenueId(), {
                skipUnscopedQueryCheck: true,
              });
              // Non-null: the outer trap already confirmed `methodProp` is a
              // function on the (non-transacted) delegate for `modelName`;
              // the transaction client's delegate has the identical shape.
              // Invoked directly (not hoisted to a variable first) so the
              // receiver — `dynamicTx[modelName]` — stays the call's `this`
              // (see trap 2 above).
              return dynamicTx[modelName]![methodProp as string]!(...args);
            });
          };
        },
      });
    },
  });
}
