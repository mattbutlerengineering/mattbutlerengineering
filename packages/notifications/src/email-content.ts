import type { BookingNotificationInput } from "./port.js";
import { escapeHtml, sanitizeUrl } from "./sanitize.js";
import { escapeIcalText } from "./ical.js";

export { escapeHtml, sanitizeUrl, escapeIcalText };

export type NotificationEventType = "confirmation" | "reminder" | "modified" | "cancelled";

export interface BookingEmailTemplateInput extends BookingNotificationInput {
  manageBaseUrl: string;
}

interface BookingEmailTemplate {
  subject: string;
  html: string;
}

interface EventCopy {
  heading: string;
  subject: string;
  includeAddress: boolean;
  includeManageLink: boolean;
}

function eventCopy(venueName: string, event: NotificationEventType): EventCopy {
  switch (event) {
    case "confirmation":
      return {
        heading: "Your reservation is confirmed",
        subject: `Reservation Confirmed — ${venueName}`,
        includeAddress: true,
        includeManageLink: true,
      };
    case "reminder":
      return {
        heading: "Your reservation is tomorrow",
        subject: `Reminder: Reservation at ${venueName}`,
        includeAddress: true,
        includeManageLink: true,
      };
    case "modified":
      return {
        heading: "Your reservation has been updated",
        subject: `Updated: Reservation at ${venueName}`,
        includeAddress: true,
        includeManageLink: true,
      };
    case "cancelled":
      return {
        heading: "Your reservation has been cancelled",
        subject: `Cancelled: Reservation at ${venueName}`,
        includeAddress: false,
        includeManageLink: false,
      };
  }
}

/**
 * Builds the manage/cancel link HTML, or "" if the constructed URL fails
 * sanitizeUrl's scheme check — never renders an unsafe href.
 */
function manageLinkHtml(manageBaseUrl: string, manageToken: string): string {
  const rawUrl = `${manageBaseUrl}?token=${encodeURIComponent(manageToken)}`;
  const safeUrl = sanitizeUrl(rawUrl);
  if (!safeUrl) return "";
  return `<p><a href="${escapeHtml(safeUrl)}">Modify or Cancel</a></p>`;
}

/**
 * Single template shared by all four booking-notification email events
 * (confirmation, reminder, modified, cancelled). Consolidates HTML escaping,
 * manage-link URL sanitization, and per-event copy in one place so a new
 * event branch can't accidentally skip escaping.
 */
export function buildBookingEmail(
  input: BookingEmailTemplateInput,
  event: NotificationEventType
): BookingEmailTemplate {
  const copy = eventCopy(input.venueName, event);

  const lines = [
    `<h1>${copy.heading}</h1>`,
    `<p><strong>${escapeHtml(input.venueName)}</strong></p>`,
    `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
  ];

  if (copy.includeAddress && input.venueAddress) {
    lines.push(`<p>${escapeHtml(input.venueAddress)}</p>`);
  }

  if (copy.includeManageLink) {
    lines.push(manageLinkHtml(input.manageBaseUrl, input.manageToken));
  }

  return { subject: copy.subject, html: lines.join("\n") };
}
