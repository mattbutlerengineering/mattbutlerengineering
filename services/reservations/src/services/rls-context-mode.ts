/**
 * ADR-026 §3.3 / issue #5369, PR 1 of the enforcement sequence: the
 * unscoped-RLS-query tripwire's shared plumbing (env-driven mode, the
 * structured log line, the sweep-suite error). PR 1 is telemetry only — it
 * must not change behavior in production, which is why the default mode
 * only logs.
 *
 * Lives in its own module rather than `venue-scoped-prisma.ts` (where
 * `RLS_MODELS` itself lives) so both of this tripwire's callers can import
 * it with no cycle: `venue-scoped-prisma.ts` already imports `setVenueContext`
 * from `middleware/venue-context.ts`, so if `middleware/venue-context.ts`
 * imported the tripwire back out of `venue-scoped-prisma.ts`, that would form
 * a two-file import cycle. This module imports from neither.
 */

export type RlsContextMode = "warn" | "throw" | "off";

const ENV_VAR = "RLS_CONTEXT_MODE";

/**
 * Resolves the active mode from `process.env.RLS_CONTEXT_MODE`. Defaults to
 * `"warn"` — including when the env var is unset or set to anything other
 * than the two recognized overrides — so a missing or mistyped env var can
 * never silently escalate this into `"throw"` in production. `"warn"` is
 * also what keeps this PR behavior-neutral: it only logs, never rejects a
 * query that would otherwise have succeeded.
 */
export function resolveRlsContextMode(): RlsContextMode {
  const raw = process.env[ENV_VAR];
  return raw === "throw" || raw === "off" ? raw : "warn";
}

/** Details attached to every `rls_unscoped_query` log line / thrown error. */
export interface UnscopedRlsQueryDetails {
  /**
   * Prisma delegate name (e.g. `"table"`), or `null` when the caller can't
   * attribute one — `middleware/venue-context.ts`'s `setVenueContext` is
   * generic over every RLS-scoped table's explicit transaction call site and
   * has no way to know which model it's protecting.
   */
  model: string | null;
  /**
   * Delegate method name (e.g. `"findMany"`), or a static marker identifying
   * the non-delegate caller (`"setVenueContext"`).
   */
  method: string;
  /**
   * `"<HTTP method> <route>"` for the request that produced this query.
   * Always `null` in this PR: threading it through the request-scoped
   * `AsyncLocalStorage` store (`venue-context-store.ts`) touches every
   * `enterVenueContext`/`runWithVenueContext` call site for a field this PR
   * doesn't yet need — deferred rather than done here, per the issue's own
   * escape hatch, until the route-sweep suite (PR 2) shows it's needed for
   * triage.
   */
  route: string | null;
}

/** Thrown in `"throw"` mode. Never live in production — reserved for the future route-sweep suite (PR 2). */
export class RlsUnscopedQueryError extends Error {
  readonly details: UnscopedRlsQueryDetails;

  constructor(details: UnscopedRlsQueryDetails) {
    super(`RLS-scoped query ran with no venue context: ${JSON.stringify(details)}`);
    this.name = "RlsUnscopedQueryError";
    this.details = details;
  }
}

/**
 * Narrow logger shape the tripwire needs — satisfied by `FastifyBaseLogger`.
 * `details` is typed `object`, not `Record<string, unknown>`: a plain
 * interface like {@link UnscopedRlsQueryDetails} has no index signature, so
 * TS refuses to assign it to a `Record<string, unknown>` parameter even
 * though every property is known and compatible.
 */
export interface RlsTripwireLogger {
  warn(details: object, msg: string): void;
}

/**
 * Defaults to a no-op so importing this module never requires a logger to
 * exist yet (module load order, unit tests). `app.ts` wires the real
 * fastify/pino logger in at bootstrap via {@link setRlsTripwireLogger}.
 */
let logger: RlsTripwireLogger = { warn: () => undefined };

/** Wires the service's real logger in — called once at app bootstrap. */
export function setRlsTripwireLogger(next: RlsTripwireLogger): void {
  logger = next;
}

/**
 * The RLS_CONTEXT_MODE tripwire. Called wherever an RLS-scoped table is
 * about to be queried/written with no venue context set:
 * `venue-scoped-prisma.ts`'s auto-wrap Proxy (for `RLS_MODELS` model-delegate
 * calls), and `middleware/venue-context.ts`'s `setVenueContext` (for the
 * explicit `prisma.$transaction` call sites that manage their own
 * transaction boundary).
 */
export function recordUnscopedRlsQuery(details: Omit<UnscopedRlsQueryDetails, "route">): void {
  const mode = resolveRlsContextMode();
  if (mode === "off") return;

  const full: UnscopedRlsQueryDetails = { ...details, route: null };
  if (mode === "throw") {
    throw new RlsUnscopedQueryError(full);
  }
  logger.warn(full, "rls_unscoped_query");
}
