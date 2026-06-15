import {
  toDateString,
  type Reservation,
  type ReservationStatus,
  type Table,
  type TableShapeMetadata,
  type TableStatus,
} from "@mbe/types";

/**
 * Prisma shape accepted by toTable — the minimal intersection of every
 * Prisma table row used in this service.
 */
export interface PrismaTableRow {
  id: string;
  name: string;
  tableNumber: string | null;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  location: string | null;
  isActive: boolean;
  priority: number;
  status: string;
  venueId: string | null;
  floorPlanId: string | null;
  shapeMetadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Prisma shape accepted by toReservation.
 * guest is optional so callers that do not include the relation still type-check.
 */
export interface PrismaReservationRow {
  id: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  partySize: number;
  status: string;
  notes: string | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  occasion: string | null;
  seatingPreference: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestId: string | null;
  userId: string | null;
  tableId: string;
  table?: PrismaTableRow | null;
  guest?: { visitCount: number; communicationPreference: string | null } | null;
  venueId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a Prisma table row to a domain Table. */
export function toTable(row: PrismaTableRow): Table {
  return {
    id: row.id,
    name: row.name,
    tableNumber: row.tableNumber,
    capacity: row.capacity,
    minCovers: row.minCovers,
    maxCovers: row.maxCovers,
    location: row.location,
    isActive: row.isActive,
    priority: row.priority,
    status: row.status as TableStatus,
    venueId: row.venueId,
    floorPlanId: row.floorPlanId,
    shapeMetadata: row.shapeMetadata as TableShapeMetadata | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps a Prisma reservation row (with optional table/guest relations) to a domain Reservation. */
export function toReservation(row: PrismaReservationRow): Reservation {
  return {
    id: row.id,
    date: toDateString(row.date),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    partySize: row.partySize,
    status: row.status as ReservationStatus,
    notes: row.notes,
    cancellationReason: row.cancellationReason,
    cancellationNote: row.cancellationNote,
    occasion: row.occasion as Reservation["occasion"],
    seatingPreference: row.seatingPreference as Reservation["seatingPreference"],
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestPhone: row.guestPhone,
    guestId: row.guestId,
    userId: row.userId,
    tableId: row.tableId,
    table: row.table ? toTable(row.table) : undefined,
    guest: row.guest ?? null,
    venueId: row.venueId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
