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
 * scope without that service is showing. A held add (`base` null) is hours the Manager set for a
 * service the scope they were set in did not have, while a scope that already has it is showing.
 */
export type ParkedEdit =
  | { readonly base: DraftService; readonly draft: DraftService | null }
  | { readonly base: null; readonly draft: DraftService };

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
  /** Services the new scope lacks, whose edits or removals are held rather than saved. */
  readonly unsaved: string[];
  /** Services the new scope already has with these hours: the ones just set change nothing there. */
  readonly overridden: string[];
}

const same = (a: DraftService, b: DraftService) => servicesEqual([a], [b]);
const idOf = (rows: readonly DraftService[]) => new Set(rows.map((r) => r.venueServiceId));
const findRow = (rows: readonly DraftService[], id: string | null) =>
  id === null ? undefined : rows.find((r) => r.venueServiceId === id);

/** The name a held edit, removal or add goes by in the line that tells the Manager of it. */
export const parkedName = (p: ParkedEdit) => (p.base === null ? p.draft : (p.draft ?? p.base)).name;

/**
 * The held entries that survive an edit to the services in view. A held edit or removal goes once
 * its service is back in view; a held add goes once the Manager changes that row.
 */
export function keepParked(
  parked: readonly ParkedEdit[],
  services: readonly DraftService[],
  baseline: readonly DraftService[]
): ParkedEdit[] {
  return parked.filter((p) => {
    if (p.base !== null) return !services.some((s) => s.venueServiceId === p.base.venueServiceId);
    const now = findRow(services, p.draft.venueServiceId);
    const was = findRow(baseline, p.draft.venueServiceId);
    return now !== undefined && was !== undefined && same(was, now);
  });
}

export function switchScope(input: SwitchInput): Switched {
  const { seed } = input;
  const seedById = new Map(seed.map((r) => [r.venueServiceId, r]));
  const heldAdds = input.parked.filter((p) => p.base === null);
  const parked = input.parked.filter((p) => p.base !== null);

  // Hours added where the service was missing come back when a scope that lacks it returns, as
  // long as the row they were shown as is untouched. Otherwise they travel on, or are let go.
  const untouched = (p: ParkedEdit) => {
    const was = findRow(input.baseline, p.draft?.venueServiceId ?? null);
    const now = findRow(input.services, p.draft?.venueServiceId ?? null);
    return was !== undefined && now !== undefined && same(was, now);
  };
  const restored = heldAdds.filter(
    (p) => untouched(p) && !seedById.has(p.draft?.venueServiceId ?? "")
  );
  const carried = heldAdds.filter((p) => untouched(p) && !restored.includes(p));
  const restoredIds = idOf(restored.flatMap((p) => (p.draft ? [p.draft] : [])));
  const baseline = input.baseline.filter((r) => !restoredIds.has(r.venueServiceId));
  const services = [
    ...input.services.filter((r) => !restoredIds.has(r.venueServiceId)),
    ...restored.flatMap((p) => (p.draft ? [p.draft] : [])),
  ];

  const baselineIds = idOf(baseline);
  const serviceIds = idOf(services);
  // Edits parked earlier rejoin the draft, so a scope that has the service takes them up again.
  const base = [
    ...baseline,
    ...parked.flatMap((p) => (p.base && !baselineIds.has(p.base.venueServiceId) ? [p.base] : [])),
  ];
  const draft = [
    ...services,
    ...parked.flatMap((p) => (p.draft && !serviceIds.has(p.draft.venueServiceId) ? [p.draft] : [])),
  ];
  const draftIds = idOf(draft);
  const baseById = new Map(base.map((r) => [r.venueServiceId, r]));

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
  // Hours added for a service the new scope already has are not used there. They are held, so the
  // scope they were set in gets them back, and named when they differ from what the new scope has.
  const adds = draft.flatMap((d) =>
    d.venueServiceId !== null && !baseById.has(d.venueServiceId) && seedById.has(d.venueServiceId)
      ? [{ base: null, draft: d }]
      : []
  );
  const overridden = adds.flatMap(({ draft: d }) => {
    const there = findRow(seed, d.venueServiceId);
    return there && !same(there, d) ? [d.name || there.name] : [];
  });

  const merged = reapplyDraft({ base, draft, latest: seed });
  // An edit that leaves the row equal to what the new scope has changes nothing there. Judged on
  // the row as it lands, since the Manager's other fields give way to the new scope's.
  const matched = draft.flatMap((d) => {
    const there = findRow(seed, d.venueServiceId);
    const was = baseById.get(d.venueServiceId);
    const landed = findRow(merged, d.venueServiceId);
    return there && was && landed && !same(was, d) && same(there, landed) ? [d.name] : [];
  });

  const nextParked: ParkedEdit[] = [...edits, ...removals, ...adds, ...carried];
  return {
    services: merged,
    baseline: seed,
    parked: nextParked,
    unsaved: [...new Set([...edits, ...removals].map(parkedName))],
    overridden: [...new Set([...overridden, ...matched])],
  };
}
