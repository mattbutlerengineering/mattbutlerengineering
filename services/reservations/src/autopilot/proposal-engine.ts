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

/** Longest-waiting party first; each gets the legal free table that wastes the fewest seats. */
function offerCandidates(state: NightState, at: number, waiting: NightWaitlistEntry[]) {
  const claimed = new Set<string>();
  const out: Candidate[] = [];
  for (const entry of waiting) {
    let best: NightTable | null = null;
    for (const t of state.tables) {
      if (claimed.has(t.id)) continue;
      if (harmReason(state, { kind: "waitlist_offer", entryId: entry.id, tableId: t.id })) continue;
      if (best === null || t.capacity < best.capacity) best = t;
    }
    if (best === null) continue;
    claimed.add(best.id);
    const waited = waitedMinutes(entry, at);
    const since = waited > 0 ? `; they've waited ${waited} min` : "";
    out.push({
      proposal: {
        kind: "waitlist_offer",
        entryId: entry.id,
        tableId: best.id,
        reason: `Seat ${entryLabel(entry)} (${entry.partySize}) at ${tableName(best)} — ${tableName(best)} is free and the best fit${since}`,
      },
      waited,
      waste: best.capacity - entry.partySize,
    });
  }
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
