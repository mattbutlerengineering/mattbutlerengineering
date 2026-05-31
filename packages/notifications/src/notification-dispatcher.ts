import type {
  NotificationPort,
  BookingNotificationInput,
  WinBackNotificationInput,
} from "./port.js";
import type { SmsPort, SmsNotificationInput } from "./sms-port.js";

/**
 * Guest communication preference enum values.
 * Matches the CommunicationPreference enum in the Prisma schema.
 */
export type CommunicationPreference = "email_only" | "sms_only" | "both" | "transactional_only";

export interface NotificationDispatcherConfig {
  emailAdapter: NotificationPort;
  smsAdapter: SmsPort | null;
}

/**
 * Dispatches notifications respecting guest communication preferences.
 *
 * - Transactional messages (confirmation, reminder, modified, cancelled) always sent
 *   via the appropriate channel(s) based on preference.
 * - Marketing messages (win-back, etc.) respect preference — skipped for
 *   transactional_only guests.
 * - email_only: email channel only
 * - sms_only: SMS channel only (transactional fallback: email if no phone)
 * - both: email + SMS
 * - transactional_only: email for transactional, no marketing
 */
export class NotificationDispatcher {
  private readonly emailAdapter: NotificationPort;
  private readonly smsAdapter: SmsPort | null;

  constructor(config: NotificationDispatcherConfig) {
    this.emailAdapter = config.emailAdapter;
    this.smsAdapter = config.smsAdapter;
  }

  private shouldSendEmail(preference: CommunicationPreference): boolean {
    return (
      preference === "email_only" || preference === "both" || preference === "transactional_only"
    );
  }

  private shouldSendSms(preference: CommunicationPreference): boolean {
    return (preference === "sms_only" || preference === "both") && this.smsAdapter !== null;
  }

  /** Booking confirmation — transactional, always sent. */
  async sendBookingConfirmation(
    emailInput: BookingNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    // Confirmation is email-only (contains iCal attachment)
    if (this.shouldSendEmail(preference) || preference === "sms_only") {
      await this.emailAdapter.sendBookingConfirmation(emailInput);
    }
  }

  /** Booking reminder — transactional, sent via channel(s) matching preference. */
  async sendBookingReminder(
    emailInput: BookingNotificationInput,
    smsInput: SmsNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    const sends: Promise<void>[] = [];

    if (this.shouldSendEmail(preference)) {
      sends.push(this.emailAdapter.sendBookingReminder(emailInput));
    }

    if (this.shouldSendSms(preference)) {
      sends.push(this.smsAdapter!.sendBookingReminder(smsInput));
    }

    await Promise.all(sends);
  }

  /** Booking modified — transactional. */
  async sendBookingModified(
    emailInput: BookingNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    if (this.shouldSendEmail(preference) || preference === "sms_only") {
      await this.emailAdapter.sendBookingModified(emailInput);
    }
  }

  /** Booking cancelled — transactional. */
  async sendBookingCancelled(
    emailInput: BookingNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    if (this.shouldSendEmail(preference) || preference === "sms_only") {
      await this.emailAdapter.sendBookingCancelled(emailInput);
    }
  }

  /** Win-back — marketing, skipped for transactional_only guests. */
  async sendWinBack(
    input: WinBackNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    if (preference === "transactional_only") return;
    if (this.shouldSendEmail(preference)) {
      await this.emailAdapter.sendWinBack(input);
    }
  }
}
