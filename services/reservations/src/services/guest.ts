import type {
  Guest,
  LapsingGuest,
  StaffNote,
  CommunicationPreference,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSearchParams,
  GuestSegment,
  PaginatedResponse,
} from "@mbe/types";
import { paginate, toPaginationMeta, isPrismaNotFound } from "@mbe/database";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { runLapsedGuestScan } from "./lapsed-guest-scan.js";
import { emitLapsingGuests } from "./events.js";
import { buildGuestUpdateData } from "./guest-identity.js";

function mapPrismaGuest(guest: {
  id: string;
  venueId: string;
  email: string | null;
  phone: string | null;
  name: string;
  notes: string | null;
  visitCount: number;
  lifetimeSpend: Prisma.Decimal | null;
  lastVisit: Date | null;
  tags: unknown;
  communicationPreference: string;
  dietaryRestrictions: unknown;
  staffNotes: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Guest {
  const rawNotes = guest.staffNotes as StaffNote[] | null;
  // Return notes in reverse chronological order (newest first)
  const staffNotes = rawNotes
    ? [...rawNotes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    : [];

  return {
    id: guest.id,
    venueId: guest.venueId,
    email: guest.email,
    phone: guest.phone,
    name: guest.name,
    notes: guest.notes,
    visitCount: guest.visitCount,
    lifetimeSpend: guest.lifetimeSpend?.toString() ?? null,
    lastVisit: guest.lastVisit?.toISOString() ?? null,
    tags: guest.tags as string[] | null,
    communicationPreference: guest.communicationPreference as CommunicationPreference,
    dietaryRestrictions: guest.dietaryRestrictions as string[] | null,
    staffNotes,
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

export const guestService = {
  async list(venueId: string, page: number, limit: number): Promise<PaginatedResponse<Guest>> {
    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where: { venueId },
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
      }),
      prisma.guest.count({ where: { venueId } }),
    ]);

    return {
      data: guests.map(mapPrismaGuest),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<Guest | null> {
    const guest = await prisma.guest.findUnique({ where: { id } });
    return guest ? mapPrismaGuest(guest) : null;
  },

  async findByEmail(venueId: string, email: string): Promise<Guest | null> {
    const guest = await prisma.guest.findUnique({
      where: { venueId_email: { venueId, email } },
    });
    return guest ? mapPrismaGuest(guest) : null;
  },

  async findByPhone(venueId: string, phone: string): Promise<Guest | null> {
    const guest = await prisma.guest.findUnique({
      where: { venueId_phone: { venueId, phone } },
    });
    return guest ? mapPrismaGuest(guest) : null;
  },

  /**
   * Identity resolution: Find existing guest by email or phone, or create new one.
   * Merges dietary restrictions (union, no duplicates) when updating an existing guest.
   */
  async findOrCreate(
    venueId: string,
    data: { email?: string; phone?: string; name: string; dietaryRestrictions?: string[] }
  ): Promise<Guest> {
    // Resolve identity: email takes precedence over phone
    const existing =
      (data.email
        ? await prisma.guest.findUnique({
            where: { venueId_email: { venueId, email: data.email } },
          })
        : null) ??
      (data.phone
        ? await prisma.guest.findUnique({
            where: { venueId_phone: { venueId, phone: data.phone } },
          })
        : null);

    if (existing) {
      const snapshot = {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        phone: existing.phone,
        dietaryRestrictions: existing.dietaryRestrictions as string[] | null,
      };
      const updateData = buildGuestUpdateData(snapshot, data);
      if (Object.keys(updateData).length > 0) {
        const updated = await prisma.guest.update({
          where: { id: existing.id },
          data: updateData,
        });
        return mapPrismaGuest(updated);
      }
      return mapPrismaGuest(existing);
    }

    // Create new guest
    const guest = await prisma.guest.create({
      data: {
        venueId,
        email: data.email,
        phone: data.phone,
        name: data.name,
        ...(data.dietaryRestrictions && data.dietaryRestrictions.length > 0
          ? { dietaryRestrictions: data.dietaryRestrictions as Prisma.InputJsonValue }
          : {}),
      },
    });
    return mapPrismaGuest(guest);
  },

  async create(data: CreateGuestRequest): Promise<Guest> {
    const guest = await prisma.guest.create({
      data: {
        venueId: data.venueId,
        email: data.email,
        phone: data.phone,
        name: data.name,
        notes: data.notes,
        tags: data.tags as Prisma.InputJsonValue | undefined,
        ...(data.dietaryRestrictions !== undefined
          ? { dietaryRestrictions: data.dietaryRestrictions as Prisma.InputJsonValue }
          : {}),
      },
    });
    return mapPrismaGuest(guest);
  },

  async update(id: string, data: UpdateGuestRequest): Promise<Guest | null> {
    try {
      const updateData: Prisma.GuestUpdateInput = {};
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.name !== undefined) updateData.name = data.name;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.tags !== undefined) updateData.tags = data.tags as Prisma.InputJsonValue;
      if (data.dietaryRestrictions !== undefined) {
        updateData.dietaryRestrictions =
          data.dietaryRestrictions === null
            ? Prisma.DbNull
            : (data.dietaryRestrictions as Prisma.InputJsonValue);
      }

      const guest = await prisma.guest.update({
        where: { id },
        data: updateData,
      });
      return mapPrismaGuest(guest);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.guest.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },

  /**
   * Append a staff note to a guest. Returns updated guest or null if not found.
   * Notes are stored as a JSON array; the service always returns them newest-first.
   */
  async addNote(id: string, text: string, createdBy: string): Promise<Guest | null> {
    try {
      const existing = await prisma.guest.findUnique({ where: { id } });
      if (!existing) return null;

      const existingNotes = (existing.staffNotes as StaffNote[] | null) ?? [];
      const newNote: StaffNote = {
        text,
        createdBy,
        createdAt: new Date().toISOString(),
      };
      const updatedNotes: StaffNote[] = [...existingNotes, newNote];

      const guest = await prisma.guest.update({
        where: { id },
        data: { staffNotes: updatedNotes as unknown as Prisma.InputJsonValue },
      });
      return mapPrismaGuest(guest);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  /**
   * Update visit statistics after a completed reservation.
   */
  async recordVisit(guestId: string, visitDate: Date, spendAmount?: number): Promise<Guest | null> {
    try {
      const guest = await prisma.guest.update({
        where: { id: guestId },
        data: {
          visitCount: { increment: 1 },
          lastVisit: visitDate,
          ...(spendAmount !== undefined && {
            lifetimeSpend: { increment: spendAmount },
          }),
        },
      });
      return mapPrismaGuest(guest);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  /**
   * Search guests by name, email, or phone.
   */
  async search(params: GuestSearchParams): Promise<PaginatedResponse<Guest>> {
    const { venueId, query, tags, hasNotVisitedInDays, minVisitCount, maxVisitCount } = params;

    const where: Prisma.GuestWhereInput = { venueId };

    // Text search on name, email, phone
    const conditions: Record<string, unknown>[] = [];

    if (query) {
      conditions.push({
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
        ],
      });
    }

    // Filter by tags (JSON array contains)
    if (tags && tags.length > 0) {
      where.tags = { array_contains: tags };
    }

    // Filter by last visit date
    if (hasNotVisitedInDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - hasNotVisitedInDays);
      conditions.push({
        OR: [{ lastVisit: { lt: cutoffDate } }, { lastVisit: null }],
      });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    // Filter by visit count
    if (minVisitCount !== undefined) {
      where.visitCount = { ...(where.visitCount as object), gte: minVisitCount };
    }
    if (maxVisitCount !== undefined) {
      where.visitCount = { ...(where.visitCount as object), lte: maxVisitCount };
    }

    const SEARCH_LIMIT = 50;
    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        ...paginate({ page: 1, limit: SEARCH_LIMIT }),
        orderBy: { lastVisit: "desc" },
      }),
      prisma.guest.count({ where }),
    ]);

    return {
      data: guests.map(mapPrismaGuest),
      pagination: toPaginationMeta(1, SEARCH_LIMIT, total),
    };
  },

  /**
   * Get guest segments for a venue.
   */
  async getSegments(venueId: string): Promise<GuestSegment[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [totalGuests, vipGuests, recentVisitors, atRiskGuests, lapsedGuests, newGuests] =
      await Promise.all([
        prisma.guest.count({ where: { venueId } }),
        prisma.guest.count({ where: { venueId, visitCount: { gte: 5 } } }),
        prisma.guest.count({ where: { venueId, lastVisit: { gte: thirtyDaysAgo } } }),
        prisma.guest.count({
          where: { venueId, lastVisit: { lt: thirtyDaysAgo, gte: ninetyDaysAgo } },
        }),
        prisma.guest.count({
          where: {
            venueId,
            OR: [{ lastVisit: { lt: ninetyDaysAgo } }, { lastVisit: null, visitCount: { gt: 0 } }],
          },
        }),
        prisma.guest.count({ where: { venueId, visitCount: 0 } }),
      ]);

    return [
      { name: "All Guests", description: "Total guests in database", count: totalGuests },
      { name: "VIP", description: "Guests with 5+ visits", count: vipGuests },
      { name: "Recent", description: "Visited in the last 30 days", count: recentVisitors },
      { name: "At Risk", description: "No visit in 30-90 days", count: atRiskGuests },
      { name: "Lapsed", description: "No visit in 90+ days", count: lapsedGuests },
      { name: "New", description: "Booked but never visited", count: newGuests },
    ];
  },

  async scanLapsedGuests(venueId: string): Promise<LapsingGuest[]> {
    return runLapsedGuestScan(venueId, {
      findGuestsForScan: (vid) =>
        prisma.guest.findMany({
          where: { venueId: vid, visitCount: { gte: 3 }, lastVisit: { not: null } },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            communicationPreference: true,
            reservations: {
              where: { status: "COMPLETED" },
              select: { startTime: true },
              orderBy: { startTime: "asc" },
            },
          },
        }),
      emitLapsingGuests,
    });
  },
};
