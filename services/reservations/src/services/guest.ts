import type {
  Guest,
  StaffNote,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSearchParams,
  GuestSegment,
  PaginatedResponse,
} from "@mbe/types";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

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
    dietaryRestrictions: guest.dietaryRestrictions as string[] | null,
    staffNotes,
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

/**
 * Compute the union of two string arrays, preserving order and deduplicating.
 * Returns null if both inputs are null/undefined/empty.
 */
function mergeDietaryRestrictions(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined
): string[] | null {
  const existingArr = existing ?? [];
  const incomingArr = incoming ?? [];
  if (existingArr.length === 0 && incomingArr.length === 0) return null;
  const merged = [...existingArr];
  for (const item of incomingArr) {
    if (!merged.includes(item)) {
      merged.push(item);
    }
  }
  return merged.length > 0 ? merged : null;
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
   * Merges dietary restrictions (union, no duplicates) when updating an existing guest.
   */
  async findOrCreate(
    venueId: string,
    data: { email?: string; phone?: string; name: string; dietaryRestrictions?: string[] }
  ): Promise<Guest> {
    // Try to find by email first
    if (data.email) {
      const existingByEmail = await prisma.guest.findUnique({
        where: { venueId_email: { venueId, email: data.email } },
      });
      if (existingByEmail) {
        const updateData: Prisma.GuestUpdateInput = {};
        if (existingByEmail.name !== data.name) {
          updateData.name = data.name;
        }
        if (data.phone && existingByEmail.phone !== data.phone) {
          updateData.phone = data.phone;
        }
        // Merge dietary restrictions (union, no duplicates)
        if (data.dietaryRestrictions && data.dietaryRestrictions.length > 0) {
          const existingDietary = existingByEmail.dietaryRestrictions as string[] | null;
          const merged = mergeDietaryRestrictions(existingDietary, data.dietaryRestrictions);
          // Only update if new restrictions were added
          const hasNewRestrictions =
            merged !== null &&
            (existingDietary === null ||
              merged.length > existingDietary.length ||
              merged.some((r) => !existingDietary.includes(r)));
          if (hasNewRestrictions) {
            updateData.dietaryRestrictions = merged as Prisma.InputJsonValue;
          }
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
        const updateData: Prisma.GuestUpdateInput = {};
        if (existingByPhone.name !== data.name) {
          updateData.name = data.name;
        }
        if (data.email && existingByPhone.email !== data.email) {
          updateData.email = data.email;
        }
        // Merge dietary restrictions (union, no duplicates)
        if (data.dietaryRestrictions && data.dietaryRestrictions.length > 0) {
          const existingDietary = existingByPhone.dietaryRestrictions as string[] | null;
          const merged = mergeDietaryRestrictions(existingDietary, data.dietaryRestrictions);
          const hasNewRestrictions =
            merged !== null &&
            (existingDietary === null ||
              merged.length > existingDietary.length ||
              merged.some((r) => !existingDietary.includes(r)));
          if (hasNewRestrictions) {
            updateData.dietaryRestrictions = merged as Prisma.InputJsonValue;
          }
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

  async unsubscribe(guestId: string): Promise<void> {
    await prisma.guest.update({
      where: { id: guestId },
      data: { unsubscribed: true },
    });
  },
};
