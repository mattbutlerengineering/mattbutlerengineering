import type {
  NotificationPort,
  BookingNotificationInput,
  WinBackNotificationInput,
  ThankYouEmailInput,
} from "./port.js";
import { buildBookingEmailContent } from "./booking-email-content.js";
import { escapeHtml, sanitizeUrl } from "./email-content.js";

interface ResendClient {
  emails: {
    send(payload: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface ResendAdapterConfig {
  resend: ResendClient | null;
  fromAddress: string;
  manageBaseUrl: string;
}

export class ResendNotificationAdapter implements NotificationPort {
  private readonly resend: ResendClient | null;
  private readonly fromAddress: string;
  private readonly manageBaseUrl: string;

  constructor(config: ResendAdapterConfig) {
    this.resend = config.resend;
    this.fromAddress = config.fromAddress;
    this.manageBaseUrl = config.manageBaseUrl;
  }

  async sendBookingConfirmation(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;
    const content = buildBookingEmailContent(input, "confirmation", this.manageBaseUrl);
    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: content.subject,
      html: content.html,
      attachments: [
        {
          filename: "reservation.ics",
          content: content.ical,
          contentType: `text/calendar; method=${content.icalMethod}`,
        },
      ],
    });
  }

  async sendBookingReminder(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;
    const content = buildBookingEmailContent(input, "reminder", this.manageBaseUrl);
    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: content.subject,
      html: content.html,
    });
  }

  async sendBookingModified(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;
    const content = buildBookingEmailContent(input, "modified", this.manageBaseUrl);
    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: content.subject,
      html: content.html,
      attachments: [
        {
          filename: "reservation.ics",
          content: content.ical,
          contentType: `text/calendar; method=${content.icalMethod}`,
        },
      ],
    });
  }

  async sendBookingCancelled(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;
    const content = buildBookingEmailContent(input, "cancelled", this.manageBaseUrl);
    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: content.subject,
      html: content.html,
      attachments: [
        {
          filename: "reservation.ics",
          content: content.ical,
          contentType: `text/calendar; method=${content.icalMethod}`,
        },
      ],
    });
  }

  async sendWinBack(input: WinBackNotificationInput): Promise<void> {
    if (!this.resend) return;
    const safeGuestName = escapeHtml(input.guestName);
    const safeVenueName = escapeHtml(input.venueName);
    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: `We miss you, ${input.guestName}!`,
      html: `<p>Hi ${safeGuestName},</p><p>It&apos;s been a while since we&apos;ve seen you at ${safeVenueName}. We&apos;d love to welcome you back — book your next visit any time.</p>`,
    });
  }

  async sendThankYouEmail(input: ThankYouEmailInput): Promise<void> {
    if (!this.resend) return;

    const { guestEmail, guestFirstName, venueName, visitDate, feedbackUrl, unsubscribeToken } =
      input;

    const safeName = escapeHtml(guestFirstName ?? "Guest");
    const safeVenueName = escapeHtml(venueName);
    const safeVisitDate = escapeHtml(visitDate);
    const safeUnsubscribeUrl = escapeHtml(
      `${this.manageBaseUrl}/public/v1/guests/unsubscribe?token=${unsubscribeToken}`
    );

    const safeFeedbackUrl = feedbackUrl ? sanitizeUrl(feedbackUrl) : null;
    const feedbackSection = safeFeedbackUrl
      ? `<p><a href="${escapeHtml(safeFeedbackUrl)}">Share your feedback</a> — it helps us improve.</p>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Thank you for visiting ${safeVenueName}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2>Thank you, ${safeName}!</h2>
  <p>We loved having you at <strong>${safeVenueName}</strong> on ${safeVisitDate}.</p>
  <p>We hope to see you again soon.</p>
  ${feedbackSection}
  <hr style="margin-top:32px" />
  <p style="font-size:0.8em;color:#888">
    <a href="${safeUnsubscribeUrl}">Unsubscribe</a> from post-visit emails.
  </p>
</body>
</html>`;

    await this.resend.emails.send({
      from: this.fromAddress,
      to: guestEmail,
      subject: `Thank you for visiting ${venueName}!`,
      html,
    });
  }
}
