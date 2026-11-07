import { reapplyDraft } from "./conflict-review.js";
import { servicesEqual, type DraftService } from "./draft-changes.js";

/**
 * Moving a dirty draft between scopes (date, weekday, regular week). A save into the schedule
 * removes every stored row the draft lacks, so the draft cannot simply be carried across: it is
 * laid over the rows of the scope it lands in, and only what the Manager removed or edited
 * comes with it. Pure, so the round trips are pinned by `scope-switch.test.ts`.
 */

/**
 * What the Manager did in a scope that the scope now showing cannot keep, held so the trip back
 * restores it. Three kinds:
 * - an edit to, or removal of (`draft` null), a service the showing scope lacks;
 * - a held add (`base` null): hours set for a service the origin scope did not have;
 * - a held edit of a service the showing scope has (`base` and `draft`, the service in view): an
 *   edit its rows already satisfy, so it changes nothing there but is still the Manager's.
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
const findRow = (rows: readonly DraftService[], id: string | null) =>
  id === null ? undefined : rows.find((r) => r.venueServiceId === id);
const holdId = (p: ParkedEdit) => (p.base ?? p.draft).venueServiceId;
const withRow = (rows: readonly DraftService[], id: string | null, row: DraftService) =>
  rows.map((r) => (r.venueServiceId === id ? row : r));

/** The name a held edit, removal or add goes by in the line that tells the Manager of it. */
export const parkedName = (p: ParkedEdit) => (p.base === null ? p.draft : (p.draft ?? p.base)).name;

/**
 * Holds on a service the scope showing has: held adds, and held edits whose service is in the
 * scope's own rows. Everything else is held because the showing scope lacks the service.
 */
const isInViewHold = (p: ParkedEdit, baseline: readonly DraftService[]) =>
  p.base === null || (p.draft !== null && findRow(baseline, holdId(p)) !== undefined);

/**
 * The held entries that survive an edit to the services in view. A held edit or removal for a
 * service the scope lacks goes once that service is back in view; a hold on a service the scope
 * has goes only when its row is removed (whether the row was changed is judged at the next switch).
 */
export function keepParked(
  parked: readonly ParkedEdit[],
  services: readonly DraftService[],
  baseline: readonly DraftService[]
): ParkedEdit[] {
  return parked.filter((p) => {
    const inView = findRow(services, holdId(p)) !== undefined;
    return isInViewHold(p, baseline) ? inView : !inView;
  });
}

/** An in-view hold the draft has not touched since it was held, so the trip back can restore it. */
function untouched(p: ParkedEdit, input: SwitchInput) {
  const was = findRow(input.baseline, holdId(p));
  const now = findRow(input.services, holdId(p));
  return was !== undefined && now !== undefined && same(was, now);
}

/** Whether the scope landed in is the one the hold was made in, or one that lacks the service. */
function restorable(p: ParkedEdit, seed: readonly DraftService[]) {
  const there = findRow(seed, holdId(p));
  return p.base === null ? there === undefined : there !== undefined && same(there, p.base);
}

type HeldLine = "overridden" | "unsaved" | null;

/**
 * Which line tells the Manager of a hold in the scope now showing. "Overridden": that scope has
 * the hours (or applying the edit leaves its row as it is), so they change nothing there.
 * "Unsaved": the scope lacks the service, or the edit would change its row and is not applied.
 */
function heldLine(p: ParkedEdit, seed: readonly DraftService[]): HeldLine {
  const there = findRow(seed, holdId(p));
  if (p.base === null) return there !== undefined && !same(there, p.draft) ? "overridden" : null;
  if (there === undefined || p.draft === null) return "unsaved";
  const [landed] = reapplyDraft({ base: [p.base], draft: [p.draft], latest: [there] });
  return landed !== undefined && same(there, landed) ? "overridden" : "unsaved";
}

/** The rows the draft is made of once the holds that are returning have rejoined it. */
function restoreHolds(input: SwitchInput, restored: readonly ParkedEdit[]) {
  return restored.reduce(
    (rows, p) =>
      p.base === null
        ? {
            baseline: rows.baseline.filter((r) => r.venueServiceId !== p.draft.venueServiceId),
            services: [
              ...rows.services.filter((r) => r.venueServiceId !== p.draft.venueServiceId),
              p.draft,
            ],
          }
        : {
            baseline: withRow(rows.baseline, holdId(p), p.base),
            services: withRow(rows.services, holdId(p), p.draft ?? p.base),
          },
    { baseline: [...input.baseline], services: [...input.services] }
  );
}

export function switchScope(input: SwitchInput): Switched {
  const { seed } = input;
  const seedById = new Map(seed.map((r) => [r.venueServiceId, r]));
  const holds = input.parked.filter((p) => isInViewHold(p, input.baseline));
  const parked = input.parked.filter((p) => !holds.includes(p));

  // A hold on a row the draft has not touched comes back when its origin returns; one that is not
  // the origin travels on. A touched one is let go: its row is the Manager's now.
  const restored = holds.filter((p) => untouched(p, input) && restorable(p, seed));
  const carried = holds.filter((p) => untouched(p, input) && !restored.includes(p));
  const { baseline, services } = restoreHolds(input, restored);

  const ids = (rows: readonly DraftService[]) => new Set(rows.map((r) => r.venueServiceId));
  const baselineIds = ids(baseline);
  const serviceIds = ids(services);
  // Edits parked earlier rejoin the draft, so a scope that has the service takes them up again.
  const base = [
    ...baseline,
    ...parked.flatMap((p) => (p.base && !baselineIds.has(p.base.venueServiceId) ? [p.base] : [])),
  ];
  const draft = [
    ...services,
    ...parked.flatMap((p) => (p.draft && !serviceIds.has(p.draft.venueServiceId) ? [p.draft] : [])),
  ];
  const draftIds = ids(draft);
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
  const merged = reapplyDraft({ base, draft, latest: seed });
  // An edit that leaves the row equal to what the new scope has changes nothing there, so it is
  // named and held. Judged on the row as it lands, since the Manager's other fields give way to the
  // new scope's.
  const matched = draft.flatMap((d) => {
    const there = findRow(seed, d.venueServiceId);
    const was = baseById.get(d.venueServiceId);
    const landed = findRow(merged, d.venueServiceId);
    return there && was && landed && !same(was, d) && same(there, landed)
      ? [{ base: was, draft: d }]
      : [];
  });

  // Every hold the Manager's hours are not used by is named: those just made, any carried on from
  // an earlier switch, and any let go because the Manager touched that row since.
  const lost = holds.filter((p) => !untouched(p, input));
  const lines = [...adds, ...matched, ...carried].map((p) => ({ p, line: heldLine(p, seed) }));
  const named = (kind: HeldLine) => lines.filter((l) => l.line === kind).map((l) => l.p);

  return {
    services: merged,
    baseline: seed,
    parked: [...edits, ...removals, ...adds, ...matched, ...carried],
    unsaved: [...new Set([...edits, ...removals, ...lost, ...named("unsaved")].map(parkedName))],
    overridden: [...new Set(named("overridden").map(parkedName))],
  };
}
