/**
 * Copy for the Special Requests echo on the host ticket
 * (`SpecialRequestsTicket`, the Briefing card). The guest pages render the
 * same words through the message catalog (`bookingWidget.specialRequests`) so
 * they can be translated; `confirmation-copy.test.ts` pins the en-US catalog
 * to these values, so guest and host still read the same words (PRD SC4).
 * Render every value as `{value}`, never as JSX text or injected as raw HTML.
 */
const acknowledgement = "Noted. It's on your reservation for the team.";

export const CONFIRMATION_COPY = Object.freeze({
  specialRequestsLabel: "Special Requests",
  acknowledgement,
  hostCaption: `Guests see this with: “${acknowledgement}”`,
});
