import { reapplyDraft } from "./conflict-review.js";
import { servicesEqual, type DraftService } from "./draft-changes.js";

/**
 * Moving a dirty draft between scopes (date, weekday, regular week). A save into the schedule
 * removes every stored row the draft lacks, so the draft cannot simply be carried across: it is
 * laid over the rows of the scope it lands in, and only what the Manager removed or edited
 * comes with it. Pure, so the round trips are pinned by `scope-switch.test.ts`.
 */

/**
 * An edit to, or removal of (`draft` null), a service the scope it was made in had, held while a
 * scope without that service is showing.
 */
export interface ParkedEdit {
  readonly base: DraftService;
  readonly draft: DraftService | null;
}

interface SwitchInput {
  /** The rows the draft started from, in the scope it leaves. */
  readonly baseline: readonly DraftService[];
  readonly services: readonly DraftService[];
  readonly parked: readonly ParkedEdit[];
  /** The rows of the scope it lands in. */
  readonly seed: DraftService[];
}

export interface Switched {
  readonly services: DraftService[];
  readonly baseline: DraftService[];
  readonly parked: ParkedEdit[];
  /** Services the new scope lacks, whose edits are held rather than saved. */
  readonly unsaved: string[];
  /** Services the new scope already has with these hours: the ones just set change nothing there. */
  readonly overridden: string[];
}

const same = (a: DraftService, b: DraftService) => servicesEqual([a], [b]);

export function switchScope(input: SwitchInput): Switched {
  const { baseline, services, parked, seed } = input;
  const ids = (rows: readonly DraftService[]) => new Set(rows.map((r) => r.venueServiceId));
  const baselineIds = ids(baseline);
  const serviceIds = ids(services);
  // Edits parked earlier rejoin the draft, so a scope that has the service takes them up again.
  const base = [
    ...baseline,
    ...parked.map((p) => p.base).filter((b) => !baselineIds.has(b.venueServiceId)),
  ];
  const draft = [
    ...services,
    ...parked.flatMap((p) => (p.draft && !serviceIds.has(p.draft.venueServiceId) ? [p.draft] : [])),
  ];
  const draftIds = ids(draft);
  const baseById = new Map(base.map((r) => [r.venueServiceId, r]));
  const seedById = new Map(seed.map((r) => [r.venueServiceId, r]));

  const edits = draft.flatMap((d) => {
    const was = baseById.get(d.venueServiceId);
    return d.venueServiceId !== null && was && !same(was, d) && !seedById.has(d.venueServiceId)
      ? [{ base: was, draft: d }]
      : [];
  });
  // A removal of a row the new scope has no row for is held too: it would not otherwise survive
  // the trip back, where the row is seeded afresh.
  const removals = base.flatMap((b) =>
    b.venueServiceId !== null && !draftIds.has(b.venueServiceId) && !seedById.has(b.venueServiceId)
      ? [{ base: b, draft: null }]
      : []
  );
  const nextParked: ParkedEdit[] = [...edits, ...removals];
  // An edit that leaves the row equal to what the new scope has changes nothing there.
  const matched = draft.flatMap((d) => {
    const there = d.venueServiceId === null ? undefined : seedById.get(d.venueServiceId);
    const was = baseById.get(d.venueServiceId);
    return there && was && !same(was, d) && same(there, d) ? [d.name] : [];
  });
  // An added service the new scope already has keeps that scope's hours, not the ones just set.
  const overridden = draft.flatMap((d) => {
    const there = d.venueServiceId === null ? undefined : seedById.get(d.venueServiceId);
    return there && !baseById.has(d.venueServiceId) && !same(there, d)
      ? [d.name || there.name]
      : [];
  });

  return {
    services: reapplyDraft({ base, draft, latest: seed }),
    baseline: seed,
    parked: nextParked,
    unsaved: [...new Set(edits.map((p) => p.draft.name))],
    overridden: [...new Set([...overridden, ...matched])],
  };
}
