import { reapplyDraft } from "./conflict-review.js";
import { servicesEqual, type DraftService } from "./draft-changes.js";

/**
 * Moving a dirty draft between scopes (date, weekday, regular week). A save into the schedule
 * removes every stored row the draft lacks, so the draft cannot simply be carried across: it is
 * laid over the rows of the scope it lands in, and only what the Manager removed or edited
 * comes with it. Pure, so the round trips are pinned by `scope-switch.test.ts`.
 */

/** An edit to a service the scope it was made in had, held while a scope without it is showing. */
export interface ParkedEdit {
  readonly base: DraftService;
  readonly draft: DraftService;
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
  /** Added services the new scope already has: its hours are kept, not the ones just set. */
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
    ...parked.map((p) => p.draft).filter((d) => !serviceIds.has(d.venueServiceId)),
  ];
  const baseById = new Map(base.map((r) => [r.venueServiceId, r]));
  const seedById = new Map(seed.map((r) => [r.venueServiceId, r]));

  const nextParked = draft.flatMap((d) => {
    const was = baseById.get(d.venueServiceId);
    return d.venueServiceId !== null && was && !same(was, d) && !seedById.has(d.venueServiceId)
      ? [{ base: was, draft: d }]
      : [];
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
    unsaved: [...new Set(nextParked.map((p) => p.draft.name))],
    overridden: [...new Set(overridden)],
  };
}
