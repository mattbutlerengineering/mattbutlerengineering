import { prisma } from "./database.js";

/**
 * True when `ruleId` is a live rule of `venueId` stored as a plain table pause:
 * a closure on named tables (no section), every channel and service, whole
 * days, not repeating and not part of a series. A personal access token may
 * reopen only such a rule (#9778). Read through the venue-scoped client, so the
 * caller must be inside the venue's context (the route's `venueScoped`).
 */
export async function isTablePause(venueId: string, ruleId: string): Promise<boolean> {
  const rule = await prisma.dateRule.findFirst({
    where: { id: ruleId, venueId, deletedAt: null },
    select: {
      kind: true,
      targetKind: true,
      sectionId: true,
      venueServiceId: true,
      bookingTypes: true,
      repeat: true,
      window: true,
      seriesId: true,
      useScheduleId: true,
      _count: { select: { tables: true } },
    },
  });
  if (!rule) return false;
  return (
    rule.kind === "closure" &&
    rule.targetKind === "tables" &&
    rule.sectionId === null &&
    rule.venueServiceId === null &&
    rule.bookingTypes.length === 0 &&
    rule.repeat === null &&
    rule.window === null &&
    rule.seriesId === null &&
    rule.useScheduleId === null &&
    rule._count.tables > 0
  );
}
