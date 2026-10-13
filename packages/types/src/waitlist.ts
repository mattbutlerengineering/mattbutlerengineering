/** Request body for `POST /public/v1/venues/:slug/waitlist` (unauthenticated booking widget). */
export interface WaitlistJoinRequest {
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
}

/** Response shape for `POST /public/v1/venues/:slug/waitlist` (unauthenticated booking widget). */
export interface WaitlistJoinResult {
  /** Unguessable id of the guest's own entry; the key for the live-estimate read. */
  entryId: string;
  position: number;
  estimatedWaitMinutes: number;
}

/** Response shape for `GET /public/v1/venues/:slug/waitlist/:entryId` — the guest's live place in line. */
export interface WaitlistEstimate {
  position: number;
  estimatedWaitMinutes: number;
  status: WaitlistStatus;
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
