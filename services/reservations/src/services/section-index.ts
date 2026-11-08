import type { PrismaClient } from "../generated/prisma/index.js";

/**
 * The venue's sections and which tables are in each, read once per request (ADR-032). `ids` is
 * what a section closure may name; `membership` is what it blocks right now.
 */
export interface SectionIndex {
  ids: ReadonlySet<string>;
  membership: ReadonlyMap<string, readonly string[]>;
}

export const NO_SECTIONS: SectionIndex = { ids: new Set(), membership: new Map() };

export async function loadSectionIndex(
  db: Pick<PrismaClient, "floorPlanSection">,
  venueId: string
): Promise<SectionIndex> {
  const sections = await db.floorPlanSection.findMany({
    where: { venueId },
    select: { id: true, tables: { select: { id: true } } },
  });
  return {
    ids: new Set(sections.map((s) => s.id)),
    membership: new Map(sections.map((s) => [s.id, s.tables.map((t) => t.id)])),
  };
}
