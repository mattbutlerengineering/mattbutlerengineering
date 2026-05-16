export type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY" | "READY";

import type { TableShapeMetadata } from "./floor-plan.js";

export interface Table {
  id: string;
  name: string;
  tableNumber: string | null;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  location: string | null;
  isActive: boolean;
  priority: number;
  status: TableStatus;
  venueId: string | null;
  floorPlanId: string | null;
  shapeMetadata: TableShapeMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: ReservationStatus;
  notes: string | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestId: string | null;
  userId: string | null;
  tableId: string;
  table?: Table;
  venueId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationRequest {
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  tableId: string;
  notes?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestId?: string;
  venueId?: string;
}

export interface UpdateReservationRequest {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  tableId?: string;
  status?: ReservationStatus;
  notes?: string;
  cancellationReason?: string;
  cancellationNote?: string;
}

export interface UpdateTableStatusRequest {
  status: TableStatus;
}

export interface WalkInRequest {
  partySize: number;
  tableId: string;
  venueId: string;
  guestName?: string;
  durationMinutes?: number;
}

export interface CreateTableRequest {
  name: string;
  tableNumber?: string;
  capacity: number;
  minCovers?: number;
  maxCovers?: number;
  location?: string;
  priority?: number;
  venueId?: string;
  floorPlanId?: string;
  shapeMetadata?: TableShapeMetadata;
}

export interface UpdateTableRequest {
  name?: string;
  tableNumber?: string;
  capacity?: number;
  minCovers?: number;
  maxCovers?: number;
  location?: string;
  isActive?: boolean;
  priority?: number;
  floorPlanId?: string | null;
  shapeMetadata?: TableShapeMetadata | null;
}
