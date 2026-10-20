import type { RehearsalEvent, TableCycleStatus } from "./simulate-service";

export type PartyPhase = "booked" | "seated" | "finished" | "no-show";

export interface PartyState {
  readonly size: number;
  readonly tableId: string;
  readonly phase: PartyPhase;
  /** Scheduled start and end, the block's extent on the timeline. */
  readonly startAt: number;
  readonly endAt: number;
  readonly walkIn: boolean;
  readonly seatedAt: number | null;
  readonly departedAt: number | null;
}

export interface WaitingParty {
  readonly partyId: string;
  readonly size: number;
  readonly sinceAt: number;
}

export interface RehearsalCounts {
  readonly booked: number;
  readonly seated: number;
  readonly covers: number;
  readonly waiting: number;
}

export interface RehearsalState {
  readonly parties: ReadonlyMap<string, PartyState>;
  /** Tables that never appear in an event are absent: they are available. */
  readonly tableCycle: ReadonlyMap<string, TableCycleStatus>;
  readonly waiting: readonly WaitingParty[];
  readonly counts: RehearsalCounts;
  readonly lastEvent: RehearsalEvent | null;
}

export interface RehearsalMetrics {
  readonly coversServed: number;
  readonly avgTurnMinutes: number | null;
  /** Hour of day (0-23) in which the most covers were seated. */
  readonly peakHour: number | null;
  readonly tablesNeverSat: readonly string[];
  readonly longestWalkInWaitMinutes: number | null;
}

/** Number of events with `at <= minute`; events are sorted by `at`. */
export function eventIndexAt(events: readonly RehearsalEvent[], minute: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid] as RehearsalEvent).at <= minute) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Folds the first `count` events into the night's state. Never mutates `events`. */
export function foldEvents(events: readonly RehearsalEvent[], count: number): RehearsalState {
  const parties = new Map<string, PartyState>();
  const tableCycle = new Map<string, TableCycleStatus>();
  let waiting: readonly WaitingParty[] = [];
  let lastEvent: RehearsalEvent | null = null;

  for (const event of events.slice(0, Math.max(0, count))) {
    lastEvent = event;
    switch (event.kind) {
      case "booked":
        parties.set(event.partyId, {
          size: event.size,
          tableId: event.tableId,
          phase: "booked",
          startAt: event.startAt,
          endAt: event.endAt,
          walkIn: false,
          seatedAt: null,
          departedAt: null,
        });
        break;
      case "walk-in-waiting":
        waiting = [...waiting, { partyId: event.partyId, size: event.size, sinceAt: event.at }];
        break;
      case "seated": {
        const known = parties.get(event.partyId);
        parties.set(event.partyId, {
          size: event.size,
          tableId: event.tableId,
          phase: "seated",
          startAt: known?.startAt ?? event.at,
          endAt: known?.endAt ?? event.endAt,
          walkIn: known === undefined,
          seatedAt: event.at,
          departedAt: null,
        });
        waiting = waiting.filter((w) => w.partyId !== event.partyId);
        tableCycle.set(event.tableId, "occupied");
        break;
      }
      case "no-show": {
        const known = parties.get(event.partyId);
        if (known) parties.set(event.partyId, { ...known, phase: "no-show" });
        break;
      }
      case "departed": {
        const known = parties.get(event.partyId);
        if (known)
          parties.set(event.partyId, { ...known, phase: "finished", departedAt: event.at });
        break;
      }
      case "status-change":
        tableCycle.set(event.tableId, event.to);
        break;
    }
  }

  let booked = 0;
  let seated = 0;
  let covers = 0;
  for (const party of parties.values()) {
    if (party.phase === "booked") booked += 1;
    if (party.phase === "seated") {
      seated += 1;
      covers += party.size;
    }
  }
  return {
    parties,
    tableCycle,
    waiting,
    counts: { booked, seated, covers, waiting: waiting.length },
    lastEvent,
  };
}

/** The state at a simulated minute, optionally clamped to the close of the night. */
export function rehearsalStateAt(
  events: readonly RehearsalEvent[],
  minute: number,
  closeMinute: number = Number.POSITIVE_INFINITY
): RehearsalState {
  const clamped = Math.min(Math.max(minute, 0), closeMinute);
  return foldEvents(events, eventIndexAt(events, clamped));
}

/** Curtain-call numbers, derived from the same fold as the screen so they cannot disagree. */
export function rehearsalMetrics(
  events: readonly RehearsalEvent[],
  tableIds: readonly string[]
): RehearsalMetrics {
  const final = foldEvents(events, events.length);
  const seatedTables = new Set<string>();
  const coversByHour = new Map<number, number>();
  const turns: number[] = [];
  let coversServed = 0;

  for (const party of final.parties.values()) {
    if (party.seatedAt === null) continue;
    coversServed += party.size;
    seatedTables.add(party.tableId);
    const hour = Math.floor(party.seatedAt / 60);
    coversByHour.set(hour, (coversByHour.get(hour) ?? 0) + party.size);
    if (party.departedAt !== null) turns.push(party.departedAt - party.seatedAt);
  }

  let peakHour: number | null = null;
  let peakCovers = 0;
  for (const [hour, covers] of [...coversByHour].sort((a, b) => a[0] - b[0])) {
    if (covers > peakCovers) {
      peakHour = hour;
      peakCovers = covers;
    }
  }

  const waits = events.flatMap((e) => {
    if (e.kind !== "walk-in-waiting") return [];
    const seat = events.find((s) => s.kind === "seated" && s.partyId === e.partyId);
    return seat ? [seat.at - e.at] : [];
  });

  return {
    coversServed,
    avgTurnMinutes:
      turns.length === 0 ? null : Math.round(turns.reduce((a, b) => a + b, 0) / turns.length),
    peakHour,
    tablesNeverSat: tableIds.filter((id) => !seatedTables.has(id)),
    longestWalkInWaitMinutes: waits.length === 0 ? null : Math.max(...waits),
  };
}
