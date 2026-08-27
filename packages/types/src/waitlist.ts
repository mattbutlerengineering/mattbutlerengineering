/** Request body for `POST /public/v1/venues/:slug/waitlist` (unauthenticated booking widget). */
export interface WaitlistJoinRequest {
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
}

/** Response shape for `POST /public/v1/venues/:slug/waitlist` (unauthenticated booking widget). */
export interface WaitlistJoinResult {
  position: number;
  estimatedWaitMinutes: number;
}

export type WaitlistStatus = "waiting" | "notified" | "seated" | "expired" | "cancelled";

/** Full waitlist entry shape returned by the authenticated staff-facing waitlist routes. */
export interface WaitlistEntry {
  id: string;
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  position: number;
  estimatedWaitMinutes: number;
  status: WaitlistStatus;
  notifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Request body for `POST /api/v1/waitlist` (authenticated staff-facing route). */
export interface CreateWaitlistEntryRequest {
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  avgTurnTimeMinutes?: number;
}
