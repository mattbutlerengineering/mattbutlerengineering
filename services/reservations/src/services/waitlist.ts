import { prisma } from "./database.js";
import { calculatePosition, estimateWaitMinutes, recalculatePositions } from "./waitlist-utils.js";
import { Prisma } from "../generated/prisma/index.js";
import type { WaitlistStatus } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { estimateWaitFromTurnover } from "./waitlist-estimate.js";
import type { VenueSettings } from "@mbe/types";

/** How long a notified party has to claim their table before the entry expires. */
export const NOTIFY_CLAIM_WINDOW_MS = 5 * 60 * 1000;

export interface WaitlistEntryData {
  id: string;
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  position: number;
  estimatedWaitMinutes: number | null;
  status: WaitlistStatus;
  notifiedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWaitlistEntryInput {
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  avgTurnTimeMinutes?: number;
}

const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Loads the venue's settings, active tables and live PENDING/CONFIRMED bookings once,
 * and returns a pure `(position, partySize) -> minutes | null` estimator over
 * table turnover (see waitlist-estimate.ts). Null means no table fits.
 */
async function loadEstimator(
  venueId: string,
  now: Date
): Promise<(position: number, partySize: number) => number | null> {
  const [venue, tables, reservations] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId }, select: { settings: true } }),
    prisma.table.findMany({ where: { venueId, isActive: true } }),
    prisma.reservation.findMany({
      where: {
        venueId,
        status: { in: ["PENDING", "CONFIRMED"] },
        endTime: { gt: now },
        startTime: { lt: new Date(now.getTime() + LOOKAHEAD_MS) },
      },
    }),
  ]);
  const settings = venue?.settings as VenueSettings | null | undefined;
  return (position, partySize) =>
    estimateWaitFromTurnover({ position, partySize, now, tables, reservations, settings });
}

/** A waiting party that moved up the queue, with everything needed to tell them. */
export interface ImprovedPosition {
  id: string;
  venueId: string;
  guestPhone: string;
  guestName: string | null;
  previousPosition: number;
  newPosition: number;
  /** Live estimate at the new position; null when no table can seat the party. */
  estimatedWaitMinutes: number | null;
}

/** Called after a queue shuffle with the parties that moved up (never with an empty list). */
export type OnPositionsImproved = (changes: ImprovedPosition[]) => void;

async function recalculateVenuePositions(
  venueId: string,
  onImproved?: OnPositionsImproved
): Promise<void> {
  const waitingEntries = await prisma.waitlistEntry.findMany({
    where: { venueId, status: "waiting" },
    orderBy: { position: "asc" },
    select: {
      id: true,
      venueId: true,
      partySize: true,
      guestName: true,
      guestPhone: true,
      position: true,
    },
  });

  const updated = recalculatePositions(waitingEntries);
  if (updated.length === 0) return;

  const rows = Prisma.join(
    updated.map((entry) => Prisma.sql`(${entry.id}, ${entry.position}::int)`)
  );
  // A raw `$executeRaw` call bypasses `venue-scoped-prisma.ts`'s per-call
  // auto-wrap (`$`-prefixed methods pass through unwrapped, on purpose) —
  // open its own explicit transaction and set app.venue_id there (ADR-026
  // part 6), using the already-known venueId parameter.
  await prisma.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    return tx.$executeRaw`
      UPDATE "waitlist_entries" AS w
      SET position = v.position,
          -- Estimate follows position: keep the entry's own turn time
          -- (estimate / position at join) and re-multiply by its new position.
          estimated_wait_minutes = (w.estimated_wait_minutes / GREATEST(w.position, 1)) * v.position
      FROM (VALUES ${rows}) AS v(id, position)
      WHERE w.id = v.id
    `;
  });

  if (onImproved) await reportImproved(venueId, waitingEntries, updated, onImproved);
}

type WaitingRow = Pick<
  WaitlistEntryData,
  "id" | "venueId" | "partySize" | "guestName" | "guestPhone" | "position"
>;

async function reportImproved(
  venueId: string,
  before: readonly WaitingRow[],
  after: readonly { id: string; position: number }[],
  onImproved: OnPositionsImproved
): Promise<void> {
  const newPositions = new Map(after.map((e) => [e.id, e.position]));
  const moved = before.filter((e) => (newPositions.get(e.id) ?? e.position) < e.position);
  if (moved.length === 0) return;

  // The position change is already saved; an estimator failure (e.g. a venue with
  // no duration rules) must not turn that successful mutation into a 500.
  let estimate: (position: number, partySize: number) => number | null;
  try {
    estimate = await loadEstimator(venueId, new Date());
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        venueId,
        err: String(err),
        msg: "waitlist position-update estimate failed",
      }) + "\n"
    );
    return;
  }
  onImproved(
    moved.map((e) => {
      const newPosition = newPositions.get(e.id) ?? e.position;
      return {
        id: e.id,
        venueId: e.venueId,
        guestPhone: e.guestPhone,
        guestName: e.guestName,
        previousPosition: e.position,
        newPosition,
        estimatedWaitMinutes: estimate(newPosition, e.partySize),
      };
    })
  );
}

export const waitlistService = {
  async create(input: CreateWaitlistEntryInput): Promise<WaitlistEntryData> {
    const { venueId, partySize, guestName, guestPhone, avgTurnTimeMinutes } = input;

    const existingCount = await prisma.waitlistEntry.count({
      where: { venueId, status: "waiting" },
    });

    const position = calculatePosition(existingCount);
    const estimatedWait =
      avgTurnTimeMinutes !== undefined
        ? estimateWaitMinutes(position, avgTurnTimeMinutes)
        : (await loadEstimator(venueId, new Date()))(position, partySize);

    return prisma.waitlistEntry.create({
      data: {
        venueId,
        partySize,
        guestName,
        guestPhone,
        position,
        estimatedWaitMinutes: estimatedWait,
      },
    });
  },

  /**
   * Replaces each waiting entry's stored (join-time) estimate with one computed
   * from current table turnover. Entries that no table can seat get null
   * ("estimate unavailable"), never a stale or zero value. Computed on every
   * read, never persisted.
   */
  async withLiveEstimates<T extends WaitlistEntryData>(entries: T[]): Promise<T[]> {
    const first = entries[0];
    if (!first) return entries;
    const estimate = await loadEstimator(first.venueId, new Date());
    return entries.map((entry) => {
      if (entry.status !== "waiting") return entry;
      const minutes = estimate(entry.position, entry.partySize);
      return { ...entry, estimatedWaitMinutes: minutes };
    });
  },

  async listWaiting(venueId: string): Promise<WaitlistEntryData[]> {
    return prisma.waitlistEntry.findMany({
      where: { venueId, status: "waiting" },
      orderBy: { position: "asc" },
    });
  },

  /** Staff view: parties still waiting plus notified ones holding their claim window. */
  async listActive(venueId: string): Promise<WaitlistEntryData[]> {
    return prisma.waitlistEntry.findMany({
      where: { venueId, status: { in: ["waiting", "notified"] } },
      orderBy: { position: "asc" },
    });
  },

  async getById(id: string): Promise<WaitlistEntryData | null> {
    return prisma.waitlistEntry.findUnique({ where: { id } });
  },

  async seat(id: string, onImproved?: OnPositionsImproved): Promise<WaitlistEntryData | null> {
    let entry: WaitlistEntryData;
    try {
      entry = await prisma.waitlistEntry.update({
        where: { id },
        data: { status: "seated" },
      });
    } catch {
      return null;
    }
    await recalculateVenuePositions(entry.venueId, onImproved);
    return entry;
  },

  async cancel(id: string, onImproved?: OnPositionsImproved): Promise<WaitlistEntryData | null> {
    let entry: WaitlistEntryData;
    try {
      entry = await prisma.waitlistEntry.update({
        where: { id },
        data: { status: "cancelled" },
      });
    } catch {
      return null;
    }
    await recalculateVenuePositions(entry.venueId, onImproved);
    return entry;
  },

  /**
   * Records the notified lifecycle state on the row. Only a `waiting` entry
   * can be notified; anything else (seated/cancelled/already notified) -> null.
   */
  async markNotified(
    id: string,
    onImproved?: OnPositionsImproved
  ): Promise<WaitlistEntryData | null> {
    const notifiedAt = new Date();
    let entry: WaitlistEntryData;
    try {
      entry = await prisma.waitlistEntry.update({
        where: { id, status: "waiting" },
        data: {
          status: "notified",
          notifiedAt,
          expiresAt: new Date(notifiedAt.getTime() + NOTIFY_CLAIM_WINDOW_MS),
        },
      });
    } catch {
      return null;
    }
    // The notified party left the waiting queue: close the gap behind it.
    await recalculateVenuePositions(entry.venueId, onImproved);
    return entry;
  },

  /**
   * Undoes markNotified when the expiry job could not be scheduled, so the host
   * can retry. Only a `notified` entry reverts; anything else -> null.
   */
  async revertNotified(id: string): Promise<WaitlistEntryData | null> {
    let entry: WaitlistEntryData;
    try {
      entry = await prisma.waitlistEntry.update({
        where: { id, status: "notified" },
        data: { status: "waiting", notifiedAt: null, expiresAt: null },
      });
    } catch {
      return null;
    }
    await recalculateVenuePositions(entry.venueId);
    return entry;
  },

  /** Expires a notified entry; a no-op (null) if it was seated/cancelled meanwhile. */
  async expire(id: string): Promise<WaitlistEntryData | null> {
    try {
      return await prisma.waitlistEntry.update({
        where: { id, status: "notified" },
        data: { status: "expired" },
      });
    } catch {
      return null;
    }
  },
};
