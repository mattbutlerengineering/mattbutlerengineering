import type { NotificationPort, BookingNotificationInput } from "./port.js";
import { generateBookingIcal } from "./ical.js";

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

    const ical = generateBookingIcal(
      {
        reservationId: input.reservationId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        partySize: input.partySize,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        venueName: input.venueName,
        venueTimezone: input.venueTimezone,
        sequence: input.sequence ?? 0,
      },
      "REQUEST"
    );

    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: `Reservation Confirmed — ${input.venueName}`,
      html: this.buildConfirmationHtml(input),
      attachments: [
        {
          filename: "reservation.ics",
          content: ical,
          contentType: "text/calendar; method=REQUEST",
        },
      ],
    });
  }

  async sendBookingReminder(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;

    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: `Reminder: Reservation at ${input.venueName}`,
      html: this.buildReminderHtml(input),
    });
  }

  async sendBookingModified(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;

    const ical = generateBookingIcal(
      {
        reservationId: input.reservationId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        partySize: input.partySize,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        venueName: input.venueName,
        venueTimezone: input.venueTimezone,
        sequence: input.sequence ?? 1,
      },
      "REQUEST"
    );

    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: `Updated: Reservation at ${input.venueName}`,
      html: this.buildModifiedHtml(input),
      attachments: [
        {
          filename: "reservation.ics",
          content: ical,
          contentType: "text/calendar; method=REQUEST",
        },
      ],
    });
  }

  async sendBookingCancelled(input: BookingNotificationInput): Promise<void> {
    if (!this.resend) return;

    const ical = generateBookingIcal(
      {
        reservationId: input.reservationId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        partySize: input.partySize,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        venueName: input.venueName,
        venueTimezone: input.venueTimezone,
        sequence: input.sequence ?? 0,
      },
      "CANCEL"
    );

    await this.resend.emails.send({
      from: this.fromAddress,
      to: input.guestEmail,
      subject: `Cancelled: Reservation at ${input.venueName}`,
      html: this.buildCancelledHtml(input),
      attachments: [
        {
          filename: "reservation.ics",
          content: ical,
          contentType: "text/calendar; method=CANCEL",
        },
      ],
    });
  }

  private manageUrl(token: string): string {
    return `${this.manageBaseUrl}?token=${token}`;
  }

  private buildConfirmationHtml(input: BookingNotificationInput): string {
    return [
      `<h1>Your reservation is confirmed</h1>`,
      `<p><strong>${input.venueName}</strong></p>`,
      `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
      input.venueAddress ? `<p>${input.venueAddress}</p>` : "",
      `<p><a href="${this.manageUrl(input.manageToken)}">Modify or Cancel</a></p>`,
    ].join("\n");
  }

  private buildReminderHtml(input: BookingNotificationInput): string {
    return [
      `<h1>Your reservation is tomorrow</h1>`,
      `<p><strong>${input.venueName}</strong></p>`,
      `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
      input.venueAddress ? `<p>${input.venueAddress}</p>` : "",
      `<p><a href="${this.manageUrl(input.manageToken)}">Modify or Cancel</a></p>`,
    ].join("\n");
  }

  private buildModifiedHtml(input: BookingNotificationInput): string {
    return [
      `<h1>Your reservation has been updated</h1>`,
      `<p><strong>${input.venueName}</strong></p>`,
      `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
      input.venueAddress ? `<p>${input.venueAddress}</p>` : "",
      `<p><a href="${this.manageUrl(input.manageToken)}">Modify or Cancel</a></p>`,
    ].join("\n");
  }

  private buildCancelledHtml(input: BookingNotificationInput): string {
    return [
      `<h1>Your reservation has been cancelled</h1>`,
      `<p><strong>${input.venueName}</strong></p>`,
      `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
    ].join("\n");
  }
}
