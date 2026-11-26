import type { PrismaClient } from "../generated/prisma/index.js";

/**
 * Every date rule the venue owns, removed (soft-deleted) ones included: a rule's `seriesId` may
 * still name a removed series, but never another venue's rule.
 */
export async function loadDateRuleIds(
  db: Pick<PrismaClient, "dateRule">,
  venueId: string
): Promise<ReadonlySet<string>> {
  const rows = await db.dateRule.findMany({ where: { venueId }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
