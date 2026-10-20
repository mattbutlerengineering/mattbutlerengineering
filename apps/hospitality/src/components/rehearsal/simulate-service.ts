import { mulberry32 } from "./prng";
import { demandAt, REHEARSAL_PROFILES, type RehearsalProfileId } from "./profiles";

/** Structural table input: `@mbe/types` `Table` satisfies it, so no runtime import is needed. */
export interface RehearsalTable {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly minCovers: number;
  readonly maxCovers: number | null;
}

export type TableCycleStatus = "available" | "occupied" | "dirty" | "ready";

/** `at` is whole minutes from venue midnight. */
export type RehearsalEvent = { readonly at: number } & (
  | {
      readonly kind: "booked";
      readonly partyId: string;
      readonly size: number;
      readonly tableId: string;
      readonly startAt: number;
      readonly endAt: number;
    }
  | {
      readonly kind: "seated";
      readonly partyId: string;
      readonly tableId: string;
      readonly size: number;
      /** When the party is expected to leave (the block's end on the timeline). */
      readonly endAt: number;
    }
  | {
      readonly kind: "status-change";
      readonly tableId: string;
      readonly to: Exclude<TableCycleStatus, "occupied">;
    }
  | { readonly kind: "walk-in-waiting"; readonly partyId: string; readonly size: number }
  | { readonly kind: "no-show"; readonly partyId: string; readonly tableId: string }
  | { readonly kind: "departed"; readonly partyId: string; readonly tableId: string }
);

export interface SimulateServiceInput {
  readonly tables: readonly RehearsalTable[];
  readonly openMinute: number;
  readonly closeMinute: number;
  readonly profile: RehearsalProfileId;
  readonly seed: number;
}

const SLOT_MINUTES = 5;
/** A party needs at least this long at a table, so arrivals stop this far before close. */
const MIN_STAY_MINUTES = 40;
const NO_SHOW_GRACE_MINUTES = 15;
const MAX_WALK_IN_WAIT_MINUTES = 30;
/** Dirty -> ready takes 4 to 8 minutes, ready -> available 2. */
const READY_AFTER_MIN = 4;
const READY_AFTER_SPREAD = 5;
const AVAILABLE_AFTER_READY = 2;
const BOOKING_LEAD_MIN = 30;
const BOOKING_LEAD_SPREAD = 270;

/** Ties at the same minute resolve in this order so output is byte-stable. */
const KIND_RANK: Readonly<Record<RehearsalEvent["kind"], number>> = {
  booked: 0,
  "walk-in-waiting": 1,
  "no-show": 2,
  departed: 3,
  "status-change": 4,
  seated: 5,
};

interface Arrival {
  readonly start: number;
  readonly size: number;
  readonly duration: number;
  readonly readyAfter: number;
  readonly noShow: boolean;
  readonly lead: number;
}

function tableLimit(table: RehearsalTable): number {
  return Math.min(table.capacity, table.maxCovers ?? table.capacity);
}

function fits(table: RehearsalTable, size: number): boolean {
  return size >= table.minCovers && size <= tableLimit(table);
}

function stayMinutes(size: number, jitter: number): number {
  const base = size <= 2 ? 60 : size <= 4 ? 80 : size <= 6 ? 100 : 120;
  return base + jitter;
}

function compareEvents(a: RehearsalEvent, b: RehearsalEvent): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  const key = (e: RehearsalEvent) =>
    `${"partyId" in e ? e.partyId : ""}|${"tableId" in e ? e.tableId : ""}|${e.kind === "status-change" ? e.to : ""}`;
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Policy: turns a venue's tables into one deterministic, plausible night. Pure; the only
 * randomness is the seeded PRNG. Owns the invariants (no double booking, party fits the table,
 * everyone seated departs by close).
 */
export function simulateService(input: SimulateServiceInput): readonly RehearsalEvent[] {
  const { tables, openMinute, closeMinute, profile, seed } = input;
  if (
    !Number.isInteger(openMinute) ||
    !Number.isInteger(closeMinute) ||
    closeMinute <= openMinute
  ) {
    throw new RangeError("closeMinute must be after openMinute");
  }
  if (!Number.isInteger(seed)) {
    throw new RangeError("seed must be an integer");
  }
  const config = REHEARSAL_PROFILES[profile];
  const sizes = config.partySizes.filter(({ size }) => tables.some((t) => fits(t, size)));
  if (tables.length === 0 || sizes.length === 0) return [];

  const rng = mulberry32(seed);
  const sizeWeightTotal = sizes.reduce((sum, s) => sum + s.weight, 0);
  const pickSize = (): number => {
    let roll = rng() * sizeWeightTotal;
    for (const { size, weight } of sizes) {
      roll -= weight;
      if (roll < 0) return size;
    }
    return (sizes[sizes.length - 1] as { size: number }).size;
  };

  const profileForDemand = { ...config, openMinute, closeMinute };
  const draw = (perTableHour: number, noShowRate: number): Arrival[] => {
    const out: Arrival[] = [];
    for (let slot = openMinute; slot + MIN_STAY_MINUTES <= closeMinute; slot += SLOT_MINUTES) {
      const expected =
        perTableHour * tables.length * demandAt(profileForDemand, slot) * (SLOT_MINUTES / 60);
      const count = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
      for (let i = 0; i < count; i += 1) {
        const start = slot + Math.floor(rng() * SLOT_MINUTES);
        const size = pickSize();
        out.push({
          start,
          size,
          duration: stayMinutes(size, Math.floor(rng() * 31) - 10),
          readyAfter: READY_AFTER_MIN + Math.floor(rng() * READY_AFTER_SPREAD),
          noShow: noShowRate > 0 && rng() < noShowRate,
          lead: BOOKING_LEAD_MIN + Math.floor(rng() * BOOKING_LEAD_SPREAD),
        });
      }
    }
    return out;
  };

  // Smallest table that fits is tried first; input order breaks ties.
  const bySize = [...tables.map((table, index) => ({ table, index }))]
    .sort((a, b) => a.table.capacity - b.table.capacity || a.index - b.index)
    .map(({ table }) => table);
  const busy = new Map<string, Array<readonly [number, number]>>();
  const isFree = (tableId: string, from: number, to: number): boolean =>
    (busy.get(tableId) ?? []).every(([s, e]) => to <= s || from >= e);
  const claim = (tableId: string, from: number, to: number): void => {
    busy.set(tableId, [...(busy.get(tableId) ?? []), [from, to] as const]);
  };
  const findTable = (size: number, from: number, to: number): RehearsalTable | undefined =>
    bySize.find((t) => fits(t, size) && isFree(t.id, from, to));

  const events: RehearsalEvent[] = [];
  let partyCount = 0;
  const nextPartyId = () => {
    partyCount += 1;
    return `p${partyCount}`;
  };

  const cleanup = (tableId: string, endAt: number, readyAfter: number): void => {
    const steps = [
      { at: endAt, to: "dirty" },
      { at: endAt + readyAfter, to: "ready" },
      { at: endAt + readyAfter + AVAILABLE_AFTER_READY, to: "available" },
    ] as const;
    for (const step of steps) {
      if (step.at <= closeMinute) {
        events.push({ at: step.at, kind: "status-change", tableId, to: step.to });
      }
    }
  };

  const turnover = (a: Arrival) => a.readyAfter + AVAILABLE_AFTER_READY;

  for (const a of draw(config.bookingsPerTableHour, config.noShowRate)) {
    const endAt = a.noShow ? a.start + NO_SHOW_GRACE_MINUTES : a.start + a.duration;
    if (endAt > closeMinute) continue;
    const holdUntil = a.noShow ? endAt : endAt + turnover(a);
    const table = findTable(a.size, a.start, holdUntil);
    if (!table) continue;
    claim(table.id, a.start, holdUntil);
    const partyId = nextPartyId();
    events.push({
      at: Math.max(openMinute, a.start - a.lead),
      kind: "booked",
      partyId,
      size: a.size,
      tableId: table.id,
      startAt: a.start,
      endAt,
    });
    if (a.noShow) {
      events.push({ at: endAt, kind: "no-show", partyId, tableId: table.id });
      continue;
    }
    events.push({ at: a.start, kind: "seated", partyId, tableId: table.id, size: a.size, endAt });
    events.push({ at: endAt, kind: "departed", partyId, tableId: table.id });
    cleanup(table.id, endAt, a.readyAfter);
  }

  for (const a of draw(config.walkInsPerTableHour, 0)) {
    for (let wait = 0; wait <= MAX_WALK_IN_WAIT_MINUTES; wait += 1) {
      const seatAt = a.start + wait;
      const endAt = seatAt + a.duration;
      if (endAt > closeMinute) break;
      const table = findTable(a.size, seatAt, endAt + turnover(a));
      if (!table) continue;
      claim(table.id, seatAt, endAt + turnover(a));
      const partyId = nextPartyId();
      if (wait > 0) {
        events.push({ at: a.start, kind: "walk-in-waiting", partyId, size: a.size });
      }
      events.push({ at: seatAt, kind: "seated", partyId, tableId: table.id, size: a.size, endAt });
      events.push({ at: endAt, kind: "departed", partyId, tableId: table.id });
      cleanup(table.id, endAt, a.readyAfter);
      break;
    }
  }

  return events.sort(compareEvents);
}
