import type { NotificationPort, BookingNotificationInput } from "./port.js";

interface TwilioClient {
  messages: {
    create(params: { body: string; from: string; to: string }): Promise<{ sid: string }>;
  };
}

export interface TwilioAdapterConfig {
  twilio: TwilioClient | null;
  fromNumber: string;
}

export class TwilioSmsAdapter implements NotificationPort {
  private readonly twilio: TwilioClient | null;
  private readonly fromNumber: string;

  constructor(config: TwilioAdapterConfig) {
    this.twilio = config.twilio;
    this.fromNumber = config.fromNumber;
  }

  private async send(to: string | null, body: string): Promise<void> {
    if (!this.twilio || !to) return;
    await this.twilio.messages.create({ body, from: this.fromNumber, to });
  }

  async sendBookingConfirmation(input: BookingNotificationInput): Promise<void> {
    await this.send(
      input.guestPhone,
      `Your reservation at ${input.venueName} on ${input.date} at ${input.startTime} (party of ${input.partySize}) is confirmed.`
    );
  }

  async sendBookingReminder(input: BookingNotificationInput): Promise<void> {
    await this.send(
      input.guestPhone,
      `Reminder: Your reservation at ${input.venueName} is tomorrow at ${input.startTime}.`
    );
  }

  async sendBookingModified(input: BookingNotificationInput): Promise<void> {
    await this.send(
      input.guestPhone,
      `Your reservation at ${input.venueName} has been updated: ${input.date} at ${input.startTime} (party of ${input.partySize}).`
    );
  }

  async sendBookingCancelled(input: BookingNotificationInput): Promise<void> {
    await this.send(
      input.guestPhone,
      `Your reservation at ${input.venueName} on ${input.date} at ${input.startTime} has been cancelled.`
    );
  }
}
