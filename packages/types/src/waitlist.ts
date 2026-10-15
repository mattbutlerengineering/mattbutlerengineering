/** Request body for `POST /public/v1/venues/:slug/waitlist` (unauthenticated booking widget). */
export interface WaitlistJoinRequest {
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
}

/** Response shape for `POST /public/v1/venues/:slug/waitlist` (unauthenticated booking widget). */
export interface WaitlistJoinResult {
  /**
   * Signed, expiring capability for reading this one entry's live status
   * (`GET .../waitlist/status?token=`). The entry id itself is a guessable cuid
   * and is deliberately never exposed or accepted as the credential.
   */
  statusToken: string;
  position: number;
  estimatedWaitMinutes: number | null;
}

/** Response shape for `GET /public/v1/venues/:slug/waitlist/status` — the guest's live place in line. */
export interface WaitlistEstimate {
  position: number;
  estimatedWaitMinutes: number | null;
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
  estimatedWaitMinutes: number | null;
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
