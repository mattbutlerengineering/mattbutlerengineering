import type {
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
  PaginatedResponse,
} from "@mbe/types";
import type { Reservation as PrismaReservation, Table as PrismaTable } from "@prisma/client";
import { prisma } from "./database.js";

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
          capacity: reservation.table.capacity,
          location: reservation.table.location,
          isActive: reservation.table.isActive,
          venueId: reservation.table.venueId,
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
        userId: userId ?? null,
        venueId: data.venueId ?? null,
      },
      include: { table: true },
    });
    return mapPrismaReservation(reservation);
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

  async cancel(id: string): Promise<Reservation | null> {
    try {
      const reservation = await prisma.reservation.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: { table: true },
      });
      return mapPrismaReservation(reservation);
    } catch {
      return null;
    }
  },
};
