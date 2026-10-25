/**
 * Catalog metadata for the ReservationList component. Read by the
 * @mbe/rialto-catalog generator to emit the Zod prop schema, AI description,
 * and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const reservationListCatalogMeta = {
  name: "ReservationList",
  description:
    "Bookings as aligned rows, in the order given (arrival order): time, guest, party size and status. Required: reservations, an array of rows. Each row needs time (display text such as 7:30 PM), partySize (a number) and status (the raw value from the tool, such as CONFIRMED, copied as is); guest is the guest name, left out for a walk-in. The element writes the party size and status in words itself. A row missing time, partySize or status is left out.",
  // Row fields are nullish and untyped beyond string/number, with no .max():
  // the seam validates the array as one value, so a strict nested rule would
  // drop the whole list over one row (F13). Reservation.guestName is
  // `string | null`, so a walk-in copied as is arrives as null. The adapter
  // drops incomplete rows.
  propSchemas: {
    reservations:
      "z.array(z.object({ time: z.string().nullish(), guest: z.string().nullish(), partySize: z.union([z.number(), z.string()]).nullish(), status: z.string().nullish() }))",
  },
} satisfies CatalogMeta;
