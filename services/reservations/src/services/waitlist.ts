import { prisma } from "./database.js";
import { calculatePosition, estimateWaitMinutes, recalculatePositions } from "./waitlist-utils.js";
import { Prisma } from "../generated/prisma/index.js";
import type { WaitlistStatus } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";

const DEFAULT_AVG_TURN_TIME_MINUTES = 30;
/** How long a notified party has to claim their table before the entry expires. */
export const NOTIFY_CLAIM_WINDOW_MS = 5 * 60 * 1000;

export interface WaitlistEntryData {
  id: string;
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  position: number;
  estimatedWaitMinutes: number;
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

async function recalculateVenuePositions(venueId: string): Promise<void> {
  const waitingEntries = await prisma.waitlistEntry.findMany({
    where: { venueId, status: "waiting" },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
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
}

export const waitlistService = {
  async create(input: CreateWaitlistEntryInput): Promise<WaitlistEntryData> {
    const { venueId, partySize, guestName, guestPhone, avgTurnTimeMinutes } = input;
    const turnTime = avgTurnTimeMinutes ?? DEFAULT_AVG_TURN_TIME_MINUTES;

    const existingCount = await prisma.waitlistEntry.count({
      where: { venueId, status: "waiting" },
    });

    const position = calculatePosition(existingCount);
    const estimatedWait = estimateWaitMinutes(position, turnTime);

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

  async listWaiting(venueId: string): Promise<WaitlistEntryData[]> {
    return prisma.waitlistEntry.findMany({
      where: { venueId, status: "waiting" },
      orderBy: { position: "asc" },
    });
  },

  async getById(id: string): Promise<WaitlistEntryData | null> {
    return prisma.waitlistEntry.findUnique({ where: { id } });
  },

  async seat(id: string): Promise<WaitlistEntryData | null> {
    let entry: WaitlistEntryData;
    try {
      entry = await prisma.waitlistEntry.update({
        where: { id },
        data: { status: "seated" },
      });
    } catch {
      return null;
    }
    await recalculateVenuePositions(entry.venueId);
    return entry;
  },

  async cancel(id: string): Promise<WaitlistEntryData | null> {
    let entry: WaitlistEntryData;
    try {
      entry = await prisma.waitlistEntry.update({
        where: { id },
        data: { status: "cancelled" },
      });
    } catch {
      return null;
    }
    await recalculateVenuePositions(entry.venueId);
    return entry;
  },

  /**
   * Records the notified lifecycle state on the row. Only a `waiting` entry
   * can be notified; anything else (seated/cancelled/already notified) -> null.
   */
  async markNotified(id: string): Promise<WaitlistEntryData | null> {
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
