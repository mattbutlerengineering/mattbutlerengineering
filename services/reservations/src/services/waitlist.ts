/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./database.js";

export type WaitlistStatus = "WAITING" | "NOTIFIED" | "SEATED" | "EXPIRED" | "REMOVED";

export interface WaitlistEntry {
  id: string;
  venueId: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  status: WaitlistStatus;
  position: number;
  notifyJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Prisma client doesn't yet have generated types for WaitlistEntry (schema added,
// pending next `prisma generate` run). Use the `any` cast until then.
const db = prisma as any;

function mapEntry(row: any): WaitlistEntry {
  return {
    id: row.id,
    venueId: row.venueId,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    partySize: row.partySize,
    status: row.status as WaitlistStatus,
    position: row.position,
    notifyJobId: row.notifyJobId ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export const waitlistService = {
  /**
   * Adds a guest to the venue waitlist at the next available position.
   */
  async add(data: {
    venueId: string;
    guestName: string;
    guestPhone: string;
    partySize: number;
  }): Promise<WaitlistEntry> {
    // Get next position (count of active entries + 1)
    const count = await db.waitlistEntry.count({
      where: { venueId: data.venueId, status: "WAITING" },
    });

    const entry = await db.waitlistEntry.create({
      data: {
        venueId: data.venueId,
        guestName: data.guestName,
        guestPhone: data.guestPhone,
        partySize: data.partySize,
        position: count + 1,
        status: "WAITING",
      },
    });

    return mapEntry(entry);
  },

  /**
   * Returns all WAITING entries for a venue ordered by position.
   */
  async listWaiting(venueId: string): Promise<WaitlistEntry[]> {
    const entries = await db.waitlistEntry.findMany({
      where: { venueId, status: "WAITING" },
      orderBy: { position: "asc" },
    });
    return entries.map(mapEntry);
  },

  /**
   * Returns a single entry by ID.
   */
  async getById(id: string): Promise<WaitlistEntry | null> {
    const entry = await db.waitlistEntry.findUnique({ where: { id } });
    return entry ? mapEntry(entry) : null;
  },

  /**
   * Updates a waitlist entry's status (and optionally notifyJobId).
   */
  async updateStatus(
    id: string,
    status: WaitlistStatus,
    notifyJobId?: string
  ): Promise<WaitlistEntry | null> {
    try {
      const entry = await db.waitlistEntry.update({
        where: { id },
        data: {
          status,
          ...(notifyJobId !== undefined ? { notifyJobId } : {}),
        },
      });
      return mapEntry(entry);
    } catch {
      return null;
    }
  },

  /**
   * Updates a waitlist entry's position.
   */
  async updatePosition(id: string, position: number): Promise<WaitlistEntry | null> {
    try {
      const entry = await db.waitlistEntry.update({
        where: { id },
        data: { position },
      });
      return mapEntry(entry);
    } catch {
      return null;
    }
  },

  /**
   * Removes (soft-deletes) an entry by setting status=REMOVED.
   */
  async remove(id: string): Promise<boolean> {
    try {
      await db.waitlistEntry.update({
        where: { id },
        data: { status: "REMOVED" },
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Gets the next WAITING entry (position 1) for a venue.
   */
  async getNext(venueId: string): Promise<WaitlistEntry | null> {
    const entry = await db.waitlistEntry.findFirst({
      where: { venueId, status: "WAITING" },
      orderBy: { position: "asc" },
    });
    return entry ? mapEntry(entry) : null;
  },
};
