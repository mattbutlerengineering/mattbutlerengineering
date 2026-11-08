import type { Table } from "@mbe/types";

/**
 * Each section's table ids, from the venue's tables: the membership `expandSectionRules` reads
 * (ADR-032). A table with no section is in none.
 */
export function sectionMembership(
  tables: readonly Pick<Table, "id" | "sectionId">[]
): ReadonlyMap<string, readonly string[]> {
  const membership = new Map<string, string[]>();
  for (const { id, sectionId } of tables) {
    if (!sectionId) continue;
    membership.set(sectionId, [...(membership.get(sectionId) ?? []), id]);
  }
  return membership;
}
