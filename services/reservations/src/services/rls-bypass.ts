import type { Prisma, PrismaClient } from "../generated/prisma/index.js";

/** Postgres default interactive-transaction timeout is 5s -- too tight for a
 * per-venue cross-venue scan against a large venue. 30s is generous enough
 * to avoid a spurious `P2028` (transaction timeout) on an otherwise-healthy
 * query while still bounding the worst case. */
const TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * ADR-026 §3 cross-venue escape hatch. Runs `callback` against a Prisma
 * transaction client after issuing `SET LOCAL ROLE app_rls_bypass` on that
 * SAME transaction (i.e. the same underlying connection checkout, per
 * Prisma's interactive `$transaction`) so the elevated role can never leak
 * onto an unrelated query on a pooled connection -- exactly the shape
 * ADR-026 §3 specifies for the audited cross-venue read paths (see
 * `./lapsed-guest-cron.ts`).
 *
 * `SET LOCAL` (unlike plain `SET`) scopes the role change to the current
 * transaction only -- Postgres automatically reverts it when the
 * transaction ends, whether by COMMIT or ROLLBACK, so there is nothing to
 * explicitly reset and nothing that can throw while resetting. A plain
 * `SET ROLE` + `RESET ROLE` in a `finally` block would itself throw if
 * `callback` left the transaction in an aborted state (e.g. a Postgres
 * `25P02` error), and that second exception would replace/mask the
 * original one -- destroying the real diagnostic. `SET LOCAL` sidesteps the
 * whole class of failure by never needing a paired "undo" statement.
 *
 * The role itself (granted `BYPASSRLS`) is created by the
 * `20260916050743_add_rls_bypass_role` migration, which also grants it
 * the table privileges its call sites need (a later migration,
 * `20260920000000_grant_rls_bypass_venues_and_schema_usage`, extended those
 * grants to `venues` once that table gained its own RLS policy): `SET
 * LOCAL ROLE` replaces the session's effective privilege set with the
 * target role's own grants, it does not additionally inherit whatever the
 * original role could already do.
 */
export function withRlsBypass<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_rls_bypass`;
      return callback(tx);
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );
}
