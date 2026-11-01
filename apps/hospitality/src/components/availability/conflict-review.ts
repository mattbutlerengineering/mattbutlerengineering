import type { AvailabilityConfig } from "@mbe/types";
import type { DraftService } from "./draft-changes.js";

/**
 * After a lost race (`version-conflict`) on a schedule drawer: what the colleague changed in the
 * schedule since the drawer opened, and the Manager's draft laid over the new version. Pure, so
 * the one rule that matters is pinned: rows the Manager did not touch are never lost.
 */

export interface ScheduleChangeSince {
  /** The schedule no longer exists (deleted or archived). */
  readonly gone: boolean;
  /** Another schedule now holds this one's place (a newer regular week); its name. */
  readonly replacedBy: string | null;
  readonly renamedTo: string | null;
  /** Service names. */
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

const HOURS_FIELDS = ["opensAt", "lastSeatingAt", "closesAt", "seating", "bookingTypes"] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function rowsByService(config: AvailabilityConfig, scheduleId: string) {
  const names = new Map(config.venueServices.map((v) => [v.id, v.name]));
  return new Map(
    config.scheduleServices
      .filter((s) => s.scheduleId === scheduleId)
      .map((s) => [
        s.venueServiceId,
        { row: s, name: names.get(s.venueServiceId) ?? s.venueServiceId },
      ])
  );
}

/**
 * `latestId` is the schedule to compare with when it is not `scheduleId` itself: the regular
 * week a newer Change regular week has replaced.
 */
export function scheduleChangesSince(
  before: AvailabilityConfig,
  after: AvailabilityConfig,
  scheduleId: string,
  latestId: string = scheduleId
): ScheduleChangeSince {
  const was = before.schedules.find((s) => s.id === scheduleId);
  const now = after.schedules.find((s) => s.id === latestId && !s.archivedAt);
  if (!now) {
    return { gone: true, replacedBy: null, renamedTo: null, added: [], removed: [], changed: [] };
  }
  const old = rowsByService(before, scheduleId);
  const next = rowsByService(after, latestId);
  return {
    gone: false,
    replacedBy: latestId !== scheduleId ? now.name : null,
    renamedTo: latestId === scheduleId && was && was.name !== now.name ? now.name : null,
    added: [...next].filter(([id]) => !old.has(id)).map(([, v]) => v.name),
    removed: [...old].filter(([id]) => !next.has(id)).map(([, v]) => v.name),
    changed: [...next]
      .filter(([id, v]) => {
        const prior = old.get(id);
        return prior !== undefined && HOURS_FIELDS.some((f) => !same(prior.row[f], v.row[f]));
      })
      .map(([, v]) => v.name),
  };
}

interface ReapplyInput {
  /** The rows the draft was seeded from. */
  readonly base: readonly DraftService[];
  /** The rows as the Manager has them now. */
  readonly draft: readonly DraftService[];
  /** The schedule's rows in the version that won. */
  readonly latest: readonly DraftService[];
}

/**
 * The winning version with only the Manager's own changes on top: their removals, their added
 * services, and each field they edited. Anything else, a colleague's new service or edit, stays.
 */
export function reapplyDraft({ base, draft, latest }: ReapplyInput): DraftService[] {
  const baseById = new Map(base.map((s) => [s.venueServiceId, s]));
  const draftById = new Map(draft.map((s) => [s.venueServiceId, s]));
  const kept = latest.flatMap((row) => {
    const was = baseById.get(row.venueServiceId);
    const mine = draftById.get(row.venueServiceId);
    if (was && !mine) return []; // the Manager removed it
    if (!was || !mine) return [row]; // the colleague's, or nothing of the Manager's to apply
    const edited = HOURS_FIELDS.filter((f) => !same(was[f], mine[f]));
    return [{ ...row, ...Object.fromEntries(edited.map((f) => [f, mine[f]])) } as DraftService];
  });
  const added = draft.filter((s) => s.venueServiceId === null || !baseById.has(s.venueServiceId));
  const fresh = added.filter(
    (s) => s.venueServiceId === null || !latest.some((l) => l.venueServiceId === s.venueServiceId)
  );
  return [...kept, ...fresh];
}
