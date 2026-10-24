import type {
  RehearsalEvent,
  RehearsalProfile,
  RehearsalTable,
  SimulateServiceInput,
} from "./types.js";

const BUS_MINUTES = 8;
const RESET_MINUTES = 2;
const NO_SHOW_GRACE_MINUTES = 15;
const MAX_WALK_IN_WAIT_MINUTES = 30;
const BOOKING_LEAD_MINUTES = 45;
const LAST_SEATING_BEFORE_CLOSE_MINUTES = 100;
const PARTY_SIZE_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.04],
  [2, 0.42],
  [3, 0.14],
  [4, 0.22],
  [5, 0.05],
  [6, 0.08],
  [7, 0.02],
  [8, 0.03],
];

interface ProfileShape {
  /** Turns of the whole room across the service. */
  turns: number;
  /** Peak arrival as minutes since midnight, before clamping into service hours. */
  peakMinutes: number;
  spreadMinutes: number;
  walkInShare: number;
  noShowShare: number;
}

const PROFILES: Record<RehearsalProfile, ProfileShape> = {
  friday: {
    turns: 2.2,
    peakMinutes: 19.5 * 60,
    spreadMinutes: 60,
    walkInShare: 0.3,
    noShowShare: 0.1,
  },
  weeknight: {
    turns: 1.2,
    peakMinutes: 19 * 60,
    spreadMinutes: 75,
    walkInShare: 0.2,
    noShowShare: 0.06,
  },
  brunch: {
    turns: 1.6,
    peakMinutes: 11 * 60,
    spreadMinutes: 60,
    walkInShare: 0.35,
    noShowShare: 0.06,
  },
};

/** mulberry32 — small, fast, deterministic. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function pickPartySize(random: () => number, maxSize: number): number {
  const usable = PARTY_SIZE_WEIGHTS.filter(([size]) => size <= maxSize);
  const total = usable.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [size, weight] of usable) {
    roll -= weight;
    if (roll <= 0) return size;
  }
  return usable[usable.length - 1]![0];
}

function turnMinutes(random: () => number, size: number): number {
  const base = size <= 2 ? 75 : size <= 4 ? 90 : size <= 6 ? 120 : 135;
  return base + Math.round((random() * 20 - 10) / 5) * 5;
}

function fits(table: RehearsalTable, size: number): boolean {
  return size >= table.minCovers && size <= table.capacity;
}

/**
 * One simulated service as a time-sorted event log. Pure and deterministic for a given
 * input — no `Math.random`, no `Date.now` — so a rehearsal can be replayed and tuned.
 */
export function simulateService({
  tables,
  openHour,
  closeHour,
  profile,
  seed,
}: SimulateServiceInput): RehearsalEvent[] {
  const random = createRandom(seed);
  const shape = PROFILES[profile];
  const open = openHour * 60;
  const close = closeHour * 60;
  const lastArrival = close - LAST_SEATING_BEFORE_CLOSE_MINUTES;
  if (tables.length === 0 || lastArrival <= open) return [];

  const maxCapacity = Math.max(...tables.map((t) => t.capacity));
  const totalSeats = tables.reduce((sum, t) => sum + t.capacity, 0);
  const partyCount = Math.round((totalSeats / 3) * shape.turns);
  const peak = Math.min(Math.max(shape.peakMinutes, open + 60), lastArrival);

  const parties = Array.from({ length: partyCount }, () => {
    const arrival = peak + gaussian(random) * shape.spreadMinutes;
    return {
      arrival: Math.round(Math.min(Math.max(arrival, open), lastArrival) / 5) * 5,
      size: pickPartySize(random, maxCapacity),
      walkIn: random() < shape.walkInShare,
      noShow: random() < shape.noShowShare,
      turn: 0,
    };
  }).sort((a, b) => a.arrival - b.arrival);
  for (const party of parties) party.turn = turnMinutes(random, party.size);

  const freeAt = new Map(tables.map((t) => [t.id, open]));
  const log: RehearsalEvent[] = [];
  let walkIns = 0;
  let bookings = 0;

  for (const party of parties) {
    const candidates = tables
      .filter((t) => fits(t, party.size))
      .sort((a, b) => a.capacity - b.capacity);
    if (candidates.length === 0) continue;

    const free = candidates.find((t) => freeAt.get(t.id)! <= party.arrival);

    if (!party.walkIn) {
      if (!free || party.arrival + party.turn + RESET_MINUTES + BUS_MINUTES > close) continue;
      const reservationId = `rehearsal-res-${++bookings}`;
      log.push({
        at: Math.max(open, party.arrival - BOOKING_LEAD_MINUTES),
        type: "booked",
        reservationId,
        partySize: party.size,
        tableId: free.id,
        arrivesAt: party.arrival,
      });
      if (party.noShow) {
        const releasedAt = party.arrival + NO_SHOW_GRACE_MINUTES;
        log.push({ at: releasedAt, type: "no-show", reservationId, tableId: free.id });
        freeAt.set(free.id, releasedAt);
        continue;
      }
      seat(free, reservationId, party.arrival, party.size, party.turn);
      continue;
    }

    const earliest = candidates.reduce((best, t) =>
      freeAt.get(t.id)! < freeAt.get(best.id)! ? t : best
    );
    const table = free ?? earliest;
    const seatAt = Math.max(party.arrival, freeAt.get(table.id)!);
    if (seatAt - party.arrival > MAX_WALK_IN_WAIT_MINUTES) continue;
    if (seatAt + party.turn + RESET_MINUTES + BUS_MINUTES > close) continue;
    const reservationId = `rehearsal-walk-in-${++walkIns}`;
    if (seatAt > party.arrival) {
      log.push({
        at: party.arrival,
        type: "walk-in-waiting",
        reservationId,
        partySize: party.size,
      });
    }
    seat(table, reservationId, seatAt, party.size, party.turn);
  }

  function seat(
    table: RehearsalTable,
    reservationId: string,
    at: number,
    size: number,
    turn: number
  ) {
    const departAt = at + turn;
    log.push(
      { at, type: "seated", reservationId, partySize: size, tableId: table.id },
      { at, type: "status-change", tableId: table.id, status: "OCCUPIED" },
      { at: departAt, type: "departed", reservationId, tableId: table.id },
      { at: departAt, type: "status-change", tableId: table.id, status: "DIRTY" },
      { at: departAt + BUS_MINUTES, type: "status-change", tableId: table.id, status: "READY" },
      {
        at: departAt + BUS_MINUTES + RESET_MINUTES,
        type: "status-change",
        tableId: table.id,
        status: "AVAILABLE",
      }
    );
    freeAt.set(table.id, departAt + BUS_MINUTES + RESET_MINUTES);
  }

  return log
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at - b.event.at || a.index - b.index)
    .map(({ event }) => event);
}
