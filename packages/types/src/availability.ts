export interface TimeSlot {
  time: string; // ISO 8601 datetime
  available: boolean;
  tables?: AvailableTable[];
}

export interface AvailableTable {
  id: string;
  name: string;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
}

export interface DateAvailability {
  date: string; // YYYY-MM-DD
  hasAvailability: boolean;
  slotCount?: number;
}

export interface AvailabilityQuery {
  date: string; // YYYY-MM-DD
  partySize: number;
  duration?: number; // minutes, optional override
}

export interface DateRangeQuery {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  partySize: number;
}

export interface ReservationHold {
  id: string;
  venueId: string;
  tableId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // ISO 8601 datetime
  endTime: string; // ISO 8601 datetime
  partySize: number;
  sessionId: string;
  expiresAt: string; // ISO 8601 datetime
  createdAt: string;
}

export interface CreateHoldRequest {
  venueId: string;
  date: string; // YYYY-MM-DD
  time: string; // ISO 8601 datetime
  partySize: number;
  tableId?: string; // optional, auto-assign if not provided
}

export interface ConfirmHoldRequest {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestId?: string;
  notes?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingReservationId?: string;
  conflictingHoldId?: string;
}

export interface PacingCheckResult {
  withinLimit: boolean;
  currentCovers: number;
  maxCovers: number;
}
