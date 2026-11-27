import { z } from "zod";

// The same validator the reservations API applies to `guestEmail`
// (`CreateReservationBodySchema` in @mbe/types). Built from zod directly rather
// than imported from the schemas barrel, which would pull every API schema into
// the guest booking bundle; `guest-email.test.ts` pins the two to agree.
const GUEST_EMAIL = z.email();

/** True when the reservations API will accept `value` as a guest email. */
export function isValidGuestEmail(value: string): boolean {
  return GUEST_EMAIL.safeParse(value).success;
}
