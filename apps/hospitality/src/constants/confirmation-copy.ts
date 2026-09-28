/**
 * Single source of copy for the Special Requests echo: the guest pages
 * (`ConfirmationView`, `ManageReservationPage`), the host ticket
 * (`SpecialRequestsTicket`, the Briefing card) and the booking form's field
 * label. PRD SC4 requires each string to be defined once, so guest and host
 * read the same words. Render every value as `{value}`, never as JSX text or
 * through `dangerouslySetInnerHTML`.
 */
const acknowledgement = "Noted. It's on your reservation for the team.";

export const CONFIRMATION_COPY = Object.freeze({
  specialRequestsLabel: "Special Requests",
  acknowledgement,
  hostCaption: `Guests see this with: “${acknowledgement}”`,
});

/**
 * The confirmation's contact line (PRD SC7). The widget's confirm path sends
 * nothing, so this never claims a message went out. Call it only when an
 * email or phone is present, passing the email if there is one.
 */
export function contactLine(contact: string): string {
  return `No confirmation email or text is sent for this booking, so save these details. The venue has ${contact} on your reservation.`;
}
