export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export interface Table {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
  isActive: boolean;
  venueId: string | null;
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
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
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
}

export interface CreateTableRequest {
  name: string;
  capacity: number;
  location?: string;
  venueId?: string;
}

export interface UpdateTableRequest {
  name?: string;
  capacity?: number;
  location?: string;
  isActive?: boolean;
}
