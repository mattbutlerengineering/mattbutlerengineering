/**
 * Reservations and guests terms: the staff-facing subset of docs/domain/ubiquitous-language.md
 * section 1 (Hospitality / Reservations). `id` keys the term and its definition under
 * `terminology` in the catalogs; `term` is the en-US spelling the catalog must carry
 * (`terminology.test.ts`).
 */

export interface ReservationsEntry {
  readonly id: string;
  readonly term: string;
}

export const RESERVATIONS_GLOSSARY: readonly ReservationsEntry[] = [
  { id: "guest", term: "Guest" },
  { id: "reservation", term: "Reservation" },
  { id: "table", term: "Table" },
  { id: "partySize", term: "Party size" },
  { id: "bookingWidget", term: "Booking widget" },
  { id: "deposit", term: "Deposit" },
  { id: "noShow", term: "No-show" },
  { id: "walkIn", term: "Walk-in" },
  { id: "waitlist", term: "Waitlist" },
  { id: "venue", term: "Venue" },
  { id: "venueGroup", term: "Venue group" },
];
