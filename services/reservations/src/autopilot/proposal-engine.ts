import { fits, harmReason, tableBlocker } from "./replay/rules.js";
import type {
  NightReservation,
  NightState,
  NightTable,
  NightWaitlistEntry,
  Proposer,
  Suggestion,
} from "./replay/types.js";

/** Most moves ever put in front of the host at once. */
export const MAX_PROPOSALS = 3;

/**
 * p95 latency budget for one `proposeMoves` call on a 40-table / 30-reservation
 * snapshot. Pinned by a many-iteration test in `proposal-engine.test.ts`.
 */
export const PROPOSAL_LATENCY_BUDGET_MS = 50;

/** A suggestion plus the short human reason the host sees. Suggestions only: nothing here applies a move. */
export type Proposal = Suggestion & { reason: string };

interface Candidate {
  proposal: Proposal;
  /** Minutes the party this move helps has waited. Longest wait ranks first. */
  waited: number;
  /** Seats left empty at the target table. Smaller is a better fit. */
  waste: number;
}

const tableName = (t: NightTable): string => t.name ?? t.id;
const entryLabel = (w: NightWaitlistEntry): string => w.label ?? `party ${w.id}`;
const reservationLabel = (r: NightReservation): string => r.label ?? `party ${r.id}`;

function moveKey(s: Suggestion): string {
  return s.kind === "reseat"
    ? `reseat:${s.reservationId}>${s.toTableId}`
    : `offer:${s.entryId}>${s.tableId}`;
}

const waitedMinutes = (entry: NightWaitlistEntry, at: number): number =>
  Math.max(0, Math.round(at - (entry.joinedAt ?? 0)));

function waitingByWait(state: NightState): NightWaitlistEntry[] {
  // Array.prototype.sort is stable, so equal waits keep list order.
  return state.waitlist
    .filter((w) => w.status === "waiting")
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
}

/**
 * A waiting party this much larger than another counts as materially larger: when a table is
 * the only one that seats them, it is held back from the smaller party.
 */
const MIN_LARGER_PARTY_GAP = 2;

/** Free tables that may legally seat each waiting party right now, ignoring other offers. Fewest seats wasted first. */
function legalTablesByEntry(
  state: NightState,
  waiting: readonly NightWaitlistEntry[]
): Map<string, NightTable[]> {
  const byEntry = new Map<string, NightTable[]>();
  for (const entry of waiting) {
    const legal = state.tables
      .filter(
        (t) =>
          harmReason(state, { kind: "waitlist_offer", entryId: entry.id, tableId: t.id }) === null
      )
      .sort((a, b) => a.capacity - b.capacity);
    byEntry.set(entry.id, legal);
  }
  return byEntry;
}

/**
 * Most parties that can sit at once, each at a distinct table from its own list (maximum
 * bipartite matching, augmenting paths). Floor sizes are tiny, so this is cheap.
 */
function maxSeatable(options: readonly (readonly string[])[]): number {
  const owner = new Map<string, number>();
  const tryParty = (p: number, seen: Set<string>): boolean =>
    options[p]!.some((t) => {
      if (seen.has(t)) return false;
      seen.add(t);
      const o = owner.get(t);
      if (o !== undefined && !tryParty(o, seen)) return false;
      owner.set(t, p);
      return true;
    });
  return options.filter((_, p) => tryParty(p, new Set())).length;
}

/**
 * True when taking `table` for `entry` would strand a party still waiting in `later` that is
 * materially larger than `entry`: with the table gone, fewer of those larger parties can be
 * seated from the remaining free tables than with it. Looks at every chain of larger parties,
 * not just the next one (a 2 on the 5-top would push the 5 onto the 6-top and strand the 6).
 */
function needsTable(
  table: NightTable,
  entry: NightWaitlistEntry,
  later: readonly NightWaitlistEntry[],
  legal: ReadonlyMap<string, NightTable[]>,
  claimed: ReadonlySet<string>
): boolean {
  const options = later
    .filter((l) => l.partySize >= entry.partySize + MIN_LARGER_PARTY_GAP)
    .map((l) => (legal.get(l.id) ?? []).filter((t) => !claimed.has(t.id)).map((t) => t.id));
  if (options.length === 0) return false;
  const without = options.map((ids) => ids.filter((id) => id !== table.id));
  return maxSeatable(without) < maxSeatable(options);
}

/**
 * Parties that need a scarce big table get it; the rest are filled longest-waiting first, each
 * with the legal free table that wastes the fewest seats. A table is held back from a party when
 * a materially larger party still waiting has no other table that seats them.
 */
function offerCandidates(state: NightState, at: number, waiting: NightWaitlistEntry[]) {
  const claimed = new Set<string>();
  const held = new Set<string>();
  const legal = legalTablesByEntry(state, waiting);
  const out: Candidate[] = [];
  waiting.forEach((entry, i) => {
    const later = waiting.slice(i + 1);
    const open = (legal.get(entry.id) ?? []).filter((t) => !claimed.has(t.id));
    const best = open.find((t) => {
      if (!needsTable(t, entry, later, legal, claimed)) return true;
      held.add(t.id);
      return false;
    });
    if (best === undefined) return;
    claimed.add(best.id);
    const waited = waitedMinutes(entry, at);
    const since = waited > 0 ? `; they've waited ${waited} min` : "";
    const why = held.has(best.id)
      ? `${tableName(best)} is the only table that fits them, so it is held back from smaller parties`
      : `${tableName(best)} is free and the best fit`;
    out.push({
      proposal: {
        kind: "waitlist_offer",
        entryId: entry.id,
        tableId: best.id,
        reason: `Seat ${entryLabel(entry)} (${entry.partySize}) at ${tableName(best)} — ${why}${since}`,
      },
      waited,
      waste: best.capacity - entry.partySize,
    });
  });
  return { candidates: out, claimed };
}

function moveTo(state: NightState, reservationId: string, tableId: string): NightState {
  return {
    ...state,
    reservations: state.reservations.map((r) => (r.id === reservationId ? { ...r, tableId } : r)),
  };
}

/** Smallest legal table (smaller than `from`) the reservation can move to, with the waiter that frees `from` for. */
function bestReseat(
  state: NightState,
  res: NightReservation,
  from: NightTable,
  waiting: readonly NightWaitlistEntry[],
  claimed: ReadonlySet<string>
): { to: NightTable; beneficiary: NightWaitlistEntry } | null {
  let best: { to: NightTable; beneficiary: NightWaitlistEntry } | null = null;
  for (const to of state.tables) {
    if (to.id === from.id || claimed.has(to.id) || to.capacity >= from.capacity) continue;
    if (best !== null && to.capacity >= best.to.capacity) continue;
    if (harmReason(state, { kind: "reseat", reservationId: res.id, toTableId: to.id })) continue;
    const after = moveTo(state, res.id, to.id);
    const beneficiary = waiting.find((w) => tableBlocker(after, from.id, w.partySize) === null);
    if (beneficiary) best = { to, beneficiary };
  }
  return best;
}

/** Move a not-yet-seated small party to a small table when that frees the table a waiting party needs. */
function reseatCandidates(
  state: NightState,
  at: number,
  waiting: readonly NightWaitlistEntry[],
  claimed: ReadonlySet<string>
): Candidate[] {
  const out: Candidate[] = [];
  const usedTables = new Set(claimed);
  const usedWaiters = new Set<string>();
  for (const res of state.reservations) {
    if (res.phase !== "booked" && res.phase !== "arrived") continue;
    const from = state.tables.find((t) => t.id === res.tableId);
    if (!from) continue;
    const open = waiting.filter((w) => !usedWaiters.has(w.id) && fits(from, w.partySize));
    if (open.length === 0) continue;
    const move = bestReseat(state, res, from, open, usedTables);
    if (!move) continue;
    usedTables.add(move.to.id);
    usedWaiters.add(move.beneficiary.id);
    const waited = waitedMinutes(move.beneficiary, at);
    out.push({
      proposal: {
        kind: "reseat",
        reservationId: res.id,
        toTableId: move.to.id,
        reason: `Move ${reservationLabel(res)} (${res.partySize}) to ${tableName(move.to)} — frees ${tableName(from)} for ${entryLabel(move.beneficiary)} (${move.beneficiary.partySize}), waiting ${waited} min`,
      },
      waited,
      waste: move.to.capacity - res.partySize,
    });
  }
  return out;
}

/**
 * The next moves worth suggesting at this snapshot, best first, at most {@link MAX_PROPOSALS}.
 * Pure and deterministic. Each is checked with the harness's own legality rules, so a harmful
 * move is never returned. `at` is minutes on the same clock as `joinedAt`.
 */
export function proposeMoves(state: NightState, at: number): readonly Proposal[] {
  return rankMoves(state, at).slice(0, MAX_PROPOSALS);
}

function rankMoves(state: NightState, at: number): readonly Proposal[] {
  const waiting = waitingByWait(state);
  if (waiting.length === 0) return [];
  const { candidates: offers, claimed } = offerCandidates(state, at, waiting);
  const offered = new Set(offers.map((o) => (o.proposal as { entryId: string }).entryId));
  const stillWaiting = waiting.filter((w) => !offered.has(w.id));
  const reseats = reseatCandidates(state, at, stillWaiting, claimed);
  return [...offers, ...reseats]
    .sort(
      (a, b) =>
        b.waited - a.waited ||
        a.waste - b.waste ||
        moveKey(a.proposal).localeCompare(moveKey(b.proposal))
    )
    .map((c) => c.proposal)
    .filter((p) => harmReason(state, p) === null);
}

/**
 * Edge-triggered proposer for the replay harness and live use: returns at most
 * {@link MAX_PROPOSALS} moves, and does not repeat a move it already made while that
 * move stays valid. Keep one instance per host session (or per replayed night).
 */
export function createProposalEngine(name = "autopilot-rule-based"): Proposer {
  let lastNight: string | null = null;
  let emitted: ReadonlySet<string> = new Set();
  return {
    name,
    propose: ({ nightId, at, state }) => {
      if (nightId !== lastNight) {
        lastNight = nightId;
        emitted = new Set();
      }
      const all = rankMoves(state, at);
      const fresh = all.filter((p) => !emitted.has(moveKey(p))).slice(0, MAX_PROPOSALS);
      const stillValid = new Set(all.map(moveKey));
      emitted = new Set([...emitted, ...fresh.map(moveKey)].filter((k) => stillValid.has(k)));
      return fresh;
    },
  };
}
