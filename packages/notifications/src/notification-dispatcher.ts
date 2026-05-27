import type { NotificationPort, BookingNotificationInput } from "./port.js";

export type CommunicationPreference = "email_only" | "sms_only" | "both" | "transactional_only";

interface DispatcherConfig {
  email: NotificationPort;
  sms: NotificationPort | null;
}

/**
 * Routes notifications to email and/or SMS adapters based on guest communication preference.
 * - email_only / transactional_only → email only
 * - sms_only → SMS only (skipped if sms adapter is null)
 * - both → email + SMS (SMS skipped if adapter is null)
 * Defaults to email_only when preference is omitted.
 */
export class NotificationDispatcher implements NotificationPort {
  private readonly email: NotificationPort;
  private readonly sms: NotificationPort | null;

  constructor(config: DispatcherConfig) {
    this.email = config.email;
    this.sms = config.sms;
  }

  private async dispatch(
    method: keyof NotificationPort,
    input: BookingNotificationInput,
    preference: CommunicationPreference = "email_only"
  ): Promise<void> {
    const useEmail =
      preference === "email_only" || preference === "transactional_only" || preference === "both";
    const useSms = preference === "sms_only" || preference === "both";

    const tasks: Promise<void>[] = [];
    if (useEmail)
      tasks.push((this.email[method] as (i: BookingNotificationInput) => Promise<void>)(input));
    if (useSms && this.sms)
      tasks.push((this.sms[method] as (i: BookingNotificationInput) => Promise<void>)(input));
    await Promise.all(tasks);
  }

  async sendBookingConfirmation(
    input: BookingNotificationInput,
    preference?: CommunicationPreference
  ): Promise<void> {
    await this.dispatch("sendBookingConfirmation", input, preference);
  }

  async sendBookingReminder(
    input: BookingNotificationInput,
    preference?: CommunicationPreference
  ): Promise<void> {
    await this.dispatch("sendBookingReminder", input, preference);
  }

  async sendBookingModified(
    input: BookingNotificationInput,
    preference?: CommunicationPreference
  ): Promise<void> {
    await this.dispatch("sendBookingModified", input, preference);
  }

  async sendBookingCancelled(
    input: BookingNotificationInput,
    preference?: CommunicationPreference
  ): Promise<void> {
    await this.dispatch("sendBookingCancelled", input, preference);
  }
}
