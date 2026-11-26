import type { DateRule } from "@mbe/types";
import { commitSave } from "./availability-commit.js";
import { loadConfigState, type StoreDb } from "./availability-config.js";
import { civilDateIn } from "./availability-migration.js";
import { loadSectionIndex } from "./section-index.js";

/** The audit row's `kind`: History words it from `summaryDetail.code`, Undo refuses it. */
export const SECTION_CLOSURE_MATERIALISED_KIND = "section_closure_materialised";

/** Who a History entry is by: the signed-in caller of the delete. */
export interface AvailabilityActor {
  actorId: string;
  actorName?: string | null;
}

/**
 * Before sections are deleted (the section itself, or the floor plan that owns them), each live
 * closure that names one becomes a plain tables closure over the section's tables as they are now
 * (ADR-032): join rows are written and `section_id` is cleared, so the closure keeps blocking
 * what it blocked instead of reopening. A closure that has already ended is left alone (the
 * foreign key clears its section). Returns how many closures it changed.
 *
 * Runs in the caller's transaction, inside the venue's RLS context. The venue row is locked
 * before the rules are read, so a closure committing at the same moment is either seen here or
 * waits for the delete (never silently reopened by the foreign key). A change goes through
 * `commitSave`: it moves the availability version, so an editor holding the old config is
 * refused as stale rather than saving a section the rule no longer names, and writes one
 * History entry by `actor` (ADR-030, ADR-032). With nothing to change it writes and bumps
 * nothing.
 */
export async function materialiseSectionClosures(
  tx: StoreDb,
  input: {
    venueId: string;
    sectionIds: readonly string[];
    now: Date;
    actor: AvailabilityActor;
  }
): Promise<number> {
  const { venueId, now, actor } = input;
  if (input.sectionIds.length === 0) return 0;
  // The lock `commitSave`'s bump takes, taken early so the read below cannot miss a commit.
  await tx.$executeRaw`SELECT 1 FROM venues WHERE id = ${venueId} FOR UPDATE`;
  const sections = new Set(input.sectionIds);
  const live = await liveClosures(tx, venueId, sections, now);
  if (live === null || live.length === 0) return 0;

  await commitSave(tx, { venueId, ...actor, version: { current: true }, now }, async (state) => {
    const { membership } = await loadSectionIndex(tx, venueId);
    const ids = new Set(live);
    return {
      next: {
        ...state.stored,
        dateRules: state.stored.dateRules.map((rule) =>
          ids.has(rule.id) ? asTablesClosure(rule, membership) : rule
        ),
      },
      validate: "touched",
      // A closure keeps blocking what it blocked; no booking is stranded by it.
      stranded: "caller",
      kind: SECTION_CLOSURE_MATERIALISED_KIND,
      summary: `Section deleted: ${live.length === 1 ? "1 closure" : `${live.length} closures`} now close${live.length === 1 ? "s" : ""} its tables`,
      detail: { code: SECTION_CLOSURE_MATERIALISED_KIND },
    };
  });
  return live.length;
}

/** Ids of the live (open-ended, or ending today or later) closures naming one of the sections. */
async function liveClosures(
  tx: StoreDb,
  venueId: string,
  sections: ReadonlySet<string>,
  now: Date
): Promise<string[] | null> {
  const state = await loadConfigState(tx, venueId, now);
  if (!state) return null;
  const today = civilDateIn(now, state.timezone);
  return state.stored.dateRules
    .filter(
      (rule) =>
        rule.sectionId != null &&
        sections.has(rule.sectionId) &&
        (rule.endsOn == null || rule.endsOn >= today)
    )
    .map((rule) => rule.id);
}

/** The closure with its section replaced by the tables the section holds now. */
function asTablesClosure(rule: DateRule, membership: ReadonlyMap<string, readonly string[]>) {
  const { sectionId, ...plain } = rule;
  return { ...plain, tableIds: [...(membership.get(sectionId ?? "") ?? [])] } as DateRule;
}
