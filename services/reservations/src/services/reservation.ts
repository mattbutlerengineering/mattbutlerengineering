import type {
  Reservation,
  ReservationStatus,
  Table,
  CreateReservationRequest,
  UpdateReservationRequest,
  WalkInRequest,
  PaginatedResponse,
  ConflictCheckResult,
  PacingCheckResult,
  TableShapeMetadata,
  VenueSettings,
} from "@mbe/types";
import type { Reservation as PrismaReservation, Table as PrismaTable } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";

type PrismaReservationWithTable = PrismaReservation & {
  table?: PrismaTable;
};

function mapPrismaReservation(reservation: PrismaReservationWithTable): Reservation {
  return {
    id: reservation.id,
    date: reservation.date.toISOString().split("T")[0],
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    partySize: reservation.partySize,
    status: reservation.status as ReservationStatus,
    notes: reservation.notes,
    cancellationReason: reservation.cancellationReason,
    cancellationNote: reservation.cancellationNote,
    guestName: reservation.guestName,
    guestEmail: reservation.guestEmail,
    guestPhone: reservation.guestPhone,
    guestId: reservation.guestId,
    userId: reservation.userId,
    tableId: reservation.tableId,
    table: reservation.table
      ? {
          id: reservation.table.id,
          name: reservation.table.name,
          tableNumber: reservation.table.tableNumber,
          capacity: reservation.table.capacity,
          minCovers: reservation.table.minCovers,
          maxCovers: reservation.table.maxCovers,
          location: reservation.table.location,
          isActive: reservation.table.isActive,
          priority: reservation.table.priority,
          status: reservation.table.status as Table["status"],
          venueId: reservation.table.venueId,
          floorPlanId: reservation.table.floorPlanId,
          shapeMetadata: reservation.table.shapeMetadata as TableShapeMetadata | null,
          createdAt: reservation.table.createdAt.toISOString(),
          updatedAt: reservation.table.updatedAt.toISOString(),
        }
      : undefined,
    venueId: reservation.venueId,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  };
}

export interface ListReservationsOptions {
  page: number;
  limit: number;
  date?: string;
  status?: ReservationStatus;
  tableId?: string;
  venueId?: string;
}

export interface CreateReservationResult {
  success: boolean;
  reservation?: Reservation;
  error?: string;
  conflict?: ConflictCheckResult;
  pacing?: PacingCheckResult;
}

export interface UpdateReservationResult {
  success: boolean;
  reservation?: Reservation;
  error?: string;
  conflict?: ConflictCheckResult;
}

export const reservationService = {
  async list(options: ListReservationsOptions): Promise<PaginatedResponse<Reservation>> {
    const { page, limit, date, status, tableId, venueId } = options;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (date) {
      where.date = new Date(date);
    }
    if (status) {
      where.status = status;
    }
    if (tableId) {
      where.tableId = tableId;
    }
    if (venueId) {
      where.venueId = venueId;
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: { table: true },
      }),
      prisma.reservation.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reservations.map(mapPrismaReservation),
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

  async listByUserId(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedResponse<Reservation>> {
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: [{ date: "desc" }, { startTime: "desc" }],
        include: { table: true },
      }),
      prisma.reservation.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reservations.map(mapPrismaReservation),
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

  async getById(id: string): Promise<Reservation | null> {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { table: true },
    });
    return reservation ? mapPrismaReservation(reservation) : null;
  },

  async create(
    data: CreateReservationRequest,
    userId?: string
  ): Promise<Reservation> {
    const reservation = await prisma.reservation.create({
      data: {
        date: new Date(data.date),
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        partySize: data.partySize,
        tableId: data.tableId,
        notes: data.notes ?? null,
        guestName: data.guestName ?? null,
        guestEmail: data.guestEmail ?? null,
        guestPhone: data.guestPhone ?? null,
        guestId: data.guestId ?? null,
        userId: userId ?? null,
        venueId: data.venueId ?? null,
      },
      include: { table: true },
    });
    return mapPrismaReservation(reservation);
  },

  /**
   * Creates a reservation with conflict and pacing checks.
   * Used for staff direct booking (bypassing hold flow).
   */
  async createWithConflictCheck(
    data: CreateReservationRequest,
    userId?: string
  ): Promise<CreateReservationResult> {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    // Check for conflicts
    const conflict = await availabilityService.checkConflict(
      data.tableId,
      data.date,
      startTime,
      endTime
    );

    if (conflict.hasConflict) {
      return {
        success: false,
        error: "Time slot has a conflict with an existing reservation or hold",
        conflict,
      };
    }

    // Check pacing limits if venue is specified
    if (data.venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: data.venueId },
      });

      if (venue) {
        const settings = venue.settings as VenueSettings | null;
        const pacing = await availabilityService.checkPacing(
          data.venueId,
          startTime,
          data.partySize,
          settings
        );

        if (!pacing.withinLimit) {
          return {
            success: false,
            error: `Pacing limit exceeded. Maximum ${pacing.maxCovers} covers allowed per time window.`,
            pacing,
          };
        }
      }
    }

    // Create the reservation
    const reservation = await this.create(data, userId);
    return { success: true, reservation };
  },

  async update(
    id: string,
    data: UpdateReservationRequest
  ): Promise<Reservation | null> {
    try {
      const reservation = await prisma.reservation.update({
        where: { id },
        data: {
          ...(data.date !== undefined && { date: new Date(data.date) }),
          ...(data.startTime !== undefined && {
            startTime: new Date(data.startTime),
          }),
          ...(data.endTime !== undefined && { endTime: new Date(data.endTime) }),
          ...(data.partySize !== undefined && { partySize: data.partySize }),
          ...(data.tableId !== undefined && { tableId: data.tableId }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: { table: true },
      });
      return mapPrismaReservation(reservation);
    } catch {
      return null;
    }
  },

  /**
   * Updates a reservation with conflict checking.
   * Checks for conflicts when time or table is changed.
   */
  async updateWithConflictCheck(
    id: string,
    data: UpdateReservationRequest
  ): Promise<UpdateReservationResult> {
    // Get the existing reservation
    const existing = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: "Reservation not found" };
    }

    // Determine if we need to check for conflicts
    const timeOrTableChanged =
      data.date !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.tableId !== undefined;

    if (timeOrTableChanged) {
      // Build the final values for conflict check
      const date = data.date ?? existing.date.toISOString().split("T")[0];
      const startTime = data.startTime
        ? new Date(data.startTime)
        : existing.startTime;
      const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
      const tableId = data.tableId ?? existing.tableId;

      // Check for conflicts, excluding the current reservation
      const conflict = await availabilityService.checkConflict(
        tableId,
        date,
        startTime,
        endTime,
        id // Exclude this reservation from conflict check
      );

      if (conflict.hasConflict) {
        return {
          success: false,
          error: "Time slot has a conflict with an existing reservation or hold",
          conflict,
        };
      }
    }

    // Perform the update
    const reservation = await this.update(id, data);
    if (!reservation) {
      return { success: false, error: "Failed to update reservation" };
    }

    return { success: true, reservation };
  },

  async createWalkIn(
    data: WalkInRequest,
    userId?: string
  ): Promise<CreateReservationResult> {
    const now = new Date();
    const durationMinutes = data.durationMinutes ?? 90;
    const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);

    // Date only (no time component), normalized to midnight UTC
    const dateOnly = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    const dateStr = dateOnly.toISOString().split("T")[0];

    // Conflict check + creation inside a transaction to prevent TOCTOU races
    const conflict = await availabilityService.checkConflict(
      data.tableId,
      dateStr,
      now,
      endTime
    );

    if (conflict.hasConflict) {
      return {
        success: false,
        error: "Table is not available",
        conflict,
      };
    }

    const reservation = await prisma.$transaction(async (tx) => {
      // Re-check for conflicting reservations inside the transaction
      const conflicting = await tx.reservation.findFirst({
        where: {
          tableId: data.tableId,
          date: dateOnly,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          AND: [{ startTime: { lt: endTime } }, { endTime: { gt: now } }],
        },
        select: { id: true },
      });

      if (conflicting) {
        return null;
      }

      return tx.reservation.create({
        data: {
          date: dateOnly,
          startTime: now,
          endTime,
          partySize: data.partySize,
          tableId: data.tableId,
          status: "CONFIRMED",
          guestName: data.guestName ?? "Walk-in",
          guestEmail: null,
          guestPhone: null,
          guestId: null,
          userId: userId ?? null,
          venueId: data.venueId ?? null,
          notes: null,
        },
        include: { table: true },
      });
    });

    if (!reservation) {
      return {
        success: false,
        error: "Table is not available",
      };
    }

    return { success: true, reservation: mapPrismaReservation(reservation) };
  },

  async cancel(
    id: string,
    reason?: string,
    note?: string
  ): Promise<Reservation | null> {
    try {
      const reservation = await prisma.reservation.update({
        where: { id },
        data: {
          status: "CANCELLED",
          ...(reason !== undefined && { cancellationReason: reason }),
          ...(note !== undefined && { cancellationNote: note }),
        },
        include: { table: true },
      });
      return mapPrismaReservation(reservation);
    } catch {
      return null;
    }
  },
};
