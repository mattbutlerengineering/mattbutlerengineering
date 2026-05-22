import type { NotificationPort, BookingNotificationInput } from "./port.js";
import { buildBookingEmailContent } from "./booking-email-content.js";

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
}
