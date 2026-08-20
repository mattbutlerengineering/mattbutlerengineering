import { prisma } from "./database.js";
import { calculatePosition, estimateWaitMinutes, recalculatePositions } from "./waitlist-utils.js";
import { Prisma } from "../generated/prisma/index.js";
import type { WaitlistStatus } from "../generated/prisma/index.js";

const DEFAULT_AVG_TURN_TIME_MINUTES = 30;

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
  await prisma.$executeRaw`
    UPDATE "waitlist_entries" AS w
    SET position = v.position
    FROM (VALUES ${rows}) AS v(id, position)
    WHERE w.id = v.id
  `;
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

  async expire(id: string): Promise<WaitlistEntryData | null> {
    try {
      return await prisma.waitlistEntry.update({
        where: { id },
        data: { status: "expired" },
      });
    } catch {
      return null;
    }
  },
};
