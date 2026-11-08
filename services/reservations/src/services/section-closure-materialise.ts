import type { PrismaClient } from "../generated/prisma/index.js";
import { civilDateIn } from "./availability-migration.js";

export type MaterialiseDb = Pick<PrismaClient, "venue" | "dateRule" | "dateRuleTable" | "table">;

/**
 * Before sections are deleted (the section itself, or the floor plan that owns them), each live
 * closure that names one becomes a plain tables closure over the section's tables as they are now
 * (ADR-032): join rows are written and `section_id` is cleared, so the closure keeps blocking
 * what it blocked instead of reopening. A closure that has already ended is left alone (the
 * foreign key clears its section). Runs in the caller's transaction, inside the venue's RLS
 * context. Returns how many closures it changed.
 *
 * A change to a stored rule moves the availability version, so an editor holding the old
 * config is refused as stale rather than saving a section the rule no longer names.
 */
export async function materialiseSectionClosures(
  db: MaterialiseDb,
  venueId: string,
  sectionIds: readonly string[],
  now: Date
): Promise<number> {
  if (sectionIds.length === 0) return 0;
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { ianaTimezone: true },
  });
  if (!venue) return 0;
  const today = new Date(`${civilDateIn(now, venue.ianaTimezone)}T00:00:00.000Z`);
  const rules = await db.dateRule.findMany({
    where: {
      venueId,
      sectionId: { in: [...sectionIds] },
      deletedAt: null,
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
    },
    select: { id: true, sectionId: true },
  });
  if (rules.length === 0) return 0;

  const tables = await db.table.findMany({
    where: { venueId, sectionId: { in: [...sectionIds] } },
    select: { id: true, sectionId: true },
  });
  const data = rules.flatMap((rule) =>
    tables
      .filter((table) => table.sectionId === rule.sectionId)
      .map((table) => ({ dateRuleId: rule.id, tableId: table.id, venueId }))
  );
  if (data.length > 0) await db.dateRuleTable.createMany({ data, skipDuplicates: true });
  await db.dateRule.updateMany({
    where: { id: { in: rules.map((r) => r.id) }, venueId },
    data: { sectionId: null },
  });
  await db.venue.updateMany({
    where: { id: venueId },
    data: { availabilityVersion: { increment: 1 } },
  });
  return rules.length;
}
