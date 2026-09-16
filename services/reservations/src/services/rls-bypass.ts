import type { Prisma, PrismaClient } from "../generated/prisma/index.js";

/**
 * ADR-026 §3 cross-venue escape hatch. Runs `callback` against a Prisma
 * transaction client sandwiched between `SET ROLE app_rls_bypass` and
 * `RESET ROLE`, both issued on the SAME transaction (i.e. the same
 * underlying connection checkout, per Prisma's interactive `$transaction`)
 * so the elevated role can never leak onto an unrelated query on a pooled
 * connection -- exactly the shape ADR-026 §3 specifies for the two audited
 * cross-venue read paths (only the lapsed-guest-cron one is wired up so
 * far; see `./lapsed-guest-cron.ts`).
 *
 * `RESET ROLE` runs in a `finally` so a query error inside `callback` still
 * clears the elevated role before the transaction ends -- `$transaction`
 * rolls back on a thrown error regardless, but this keeps the invariant
 * "app_rls_bypass is never the last SET ROLE left standing on this
 * connection" true even if that ever changes.
 *
 * The role itself (granted `BYPASSRLS`) is created by the
 * `20260916050743_add_rls_bypass_role` migration, which also grants it
 * exactly the table privileges its call sites need: `SET ROLE` replaces the
 * session's effective privilege set with the target role's own grants, it
 * does not additionally inherit whatever the original role could already
 * do.
 */
export function withRlsBypass<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET ROLE app_rls_bypass`;
    try {
      return await callback(tx);
    } finally {
      await tx.$executeRaw`RESET ROLE`;
    }
  });
}
