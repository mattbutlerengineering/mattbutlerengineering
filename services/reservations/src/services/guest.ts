import type {
  Guest,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSearchParams,
  GuestSegment,
  PaginatedResponse,
} from "@mbe/types";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { computeGuestRisk } from "./guest-risk.js";

function isPrismaNotFound(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

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
  createdAt: Date;
  updatedAt: Date;
}): Guest {
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
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

export const guestService = {
  async list(venueId: string, page: number, limit: number): Promise<PaginatedResponse<Guest>> {
    const skip = (page - 1) * limit;

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where: { venueId },
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.guest.count({ where: { venueId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: guests.map(mapPrismaGuest),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
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
   * This is the primary method for linking reservations to guests.
   */
  async findOrCreate(
    venueId: string,
    data: { email?: string; phone?: string; name: string }
  ): Promise<Guest> {
    // Try to find by email first
    if (data.email) {
      const existingByEmail = await prisma.guest.findUnique({
        where: { venueId_email: { venueId, email: data.email } },
      });
      if (existingByEmail) {
        // Update name if different and phone if provided
        const updateData: Prisma.GuestUpdateInput = {};
        if (existingByEmail.name !== data.name) {
          updateData.name = data.name;
        }
        if (data.phone && existingByEmail.phone !== data.phone) {
          updateData.phone = data.phone;
        }
        if (Object.keys(updateData).length > 0) {
          const updated = await prisma.guest.update({
            where: { id: existingByEmail.id },
            data: updateData,
          });
          return mapPrismaGuest(updated);
        }
        return mapPrismaGuest(existingByEmail);
      }
    }

    // Try to find by phone
    if (data.phone) {
      const existingByPhone = await prisma.guest.findUnique({
        where: { venueId_phone: { venueId, phone: data.phone } },
      });
      if (existingByPhone) {
        // Update name if different and email if provided
        const updateData: Prisma.GuestUpdateInput = {};
        if (existingByPhone.name !== data.name) {
          updateData.name = data.name;
        }
        if (data.email && existingByPhone.email !== data.email) {
          updateData.email = data.email;
        }
        if (Object.keys(updateData).length > 0) {
          const updated = await prisma.guest.update({
            where: { id: existingByPhone.id },
            data: updateData,
          });
          return mapPrismaGuest(updated);
        }
        return mapPrismaGuest(existingByPhone);
      }
    }

    // Create new guest
    const guest = await prisma.guest.create({
      data: {
        venueId,
        email: data.email,
        phone: data.phone,
        name: data.name,
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

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        take: 50,
        orderBy: { lastVisit: "desc" },
      }),
      prisma.guest.count({ where }),
    ]);

    return {
      data: guests.map(mapPrismaGuest),
      pagination: {
        page: 1,
        limit: 50,
        total,
        totalPages: Math.ceil(total / 50),
        hasNext: total > 50,
        hasPrev: false,
      },
    };
  },

  /**
   * Get risk score for a guest based on no-show history.
   */
  async getRisk(guestId: string): Promise<{
    guestId: string;
    riskLevel: "trusted" | "standard" | "risky";
    noShowCount: number;
    weightedNoShows: number;
    totalReservations: number;
  }> {
    const [noShowReservations, totalReservations] = await Promise.all([
      prisma.reservation.findMany({
        where: { guestId, status: "NO_SHOW" },
        select: { date: true },
      }),
      prisma.reservation.count({ where: { guestId } }),
    ]);

    const noShowRecords = noShowReservations.map((r) => ({ reservationDate: r.date }));
    const riskLevel = computeGuestRisk(noShowRecords, totalReservations);

    const now = Date.now();
    const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000;
    const weightedNoShows = noShowRecords.reduce((sum, r) => {
      const ageMs = now - r.reservationDate.getTime();
      return sum + (ageMs > TWELVE_MONTHS_MS ? 0.5 : 1.0);
    }, 0);

    return {
      guestId,
      riskLevel,
      noShowCount: noShowReservations.length,
      weightedNoShows,
      totalReservations,
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
        // Total guests
        prisma.guest.count({ where: { venueId } }),

        // VIP: 5+ visits
        prisma.guest.count({
          where: { venueId, visitCount: { gte: 5 } },
        }),

        // Recent: visited in last 30 days
        prisma.guest.count({
          where: { venueId, lastVisit: { gte: thirtyDaysAgo } },
        }),

        // At-risk: no visit in 30-90 days
        prisma.guest.count({
          where: {
            venueId,
            lastVisit: { lt: thirtyDaysAgo, gte: ninetyDaysAgo },
          },
        }),

        // Lapsed: no visit in 90+ days
        prisma.guest.count({
          where: {
            venueId,
            OR: [{ lastVisit: { lt: ninetyDaysAgo } }, { lastVisit: null, visitCount: { gt: 0 } }],
          },
        }),

        // New: never visited (visitCount = 0)
        prisma.guest.count({
          where: { venueId, visitCount: 0 },
        }),
      ]);

    return [
      {
        name: "All Guests",
        description: "Total guests in database",
        count: totalGuests,
      },
      {
        name: "VIP",
        description: "Guests with 5+ visits",
        count: vipGuests,
      },
      {
        name: "Recent",
        description: "Visited in the last 30 days",
        count: recentVisitors,
      },
      {
        name: "At Risk",
        description: "No visit in 30-90 days",
        count: atRiskGuests,
      },
      {
        name: "Lapsed",
        description: "No visit in 90+ days",
        count: lapsedGuests,
      },
      {
        name: "New",
        description: "Booked but never visited",
        count: newGuests,
      },
    ];
  },
};
