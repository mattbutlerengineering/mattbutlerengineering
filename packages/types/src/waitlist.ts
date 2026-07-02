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
