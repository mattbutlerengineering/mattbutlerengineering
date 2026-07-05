import type {
  NotificationPort,
  BookingNotificationInput,
  WinBackNotificationInput,
  ThankYouEmailInput,
} from "./port.js";
import type { SmsPort, SmsNotificationInput } from "./sms-port.js";
import type { CommunicationPreference } from "@mbe/types";

export interface NotificationDispatcherConfig {
  emailAdapter: NotificationPort;
  smsAdapter: SmsPort | null;
  /** Base URL for manage links in SMS messages. Required when smsAdapter is non-null. */
  smsManageBaseUrl?: string;
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
 *
 * sms_only email-fallback invariant:
 *   - Structural messages (confirmation, modified, cancelled) contain iCal/structured
 *     data that cannot travel via SMS — they ALWAYS email sms_only guests.
 *   - Reminders CAN travel via SMS but fall back to email when no SMS adapter
 *     is configured (requiresEmailFallback handles this).
 */
export class NotificationDispatcher {
  private readonly emailAdapter: NotificationPort;
  private readonly smsAdapter: SmsPort | null;
  private readonly smsManageBaseUrl: string;

  constructor(config: NotificationDispatcherConfig) {
    this.emailAdapter = config.emailAdapter;
    this.smsAdapter = config.smsAdapter;
    this.smsManageBaseUrl = config.smsManageBaseUrl ?? "";
  }

  private toSmsInput(input: BookingNotificationInput): SmsNotificationInput {
    return {
      reservationId: input.reservationId,
      date: input.date,
      startTime: input.startTime,
      partySize: input.partySize,
      guestName: input.guestName,
      guestPhone: input.guestPhone ?? "",
      venueName: input.venueName,
      manageToken: input.manageToken,
      manageBaseUrl: this.smsManageBaseUrl,
    };
  }

  private shouldSendEmail(preference: CommunicationPreference): boolean {
    return (
      preference === "email_only" || preference === "both" || preference === "transactional_only"
    );
  }

  private shouldSendSms(preference: CommunicationPreference): boolean {
    return (preference === "sms_only" || preference === "both") && this.smsAdapter !== null;
  }

  /**
   * Returns true when an sms_only guest must receive a message via email
   * because no SMS adapter is configured.
   *
   * Used for messages that CAN travel via SMS (e.g. reminders) — when the
   * SMS channel is unavailable, we fall back to email rather than silently
   * dropping the notification.
   */
  private requiresEmailFallback(preference: CommunicationPreference): boolean {
    return preference === "sms_only" && this.smsAdapter === null;
  }

  /**
   * Booking confirmation — transactional, ALWAYS sent via email.
   *
   * The confirmation carries the iCal attachment — the primary value of a
   * booking confirmation — which cannot be embedded in an SMS. There is no
   * channel routing: no `channel`/`preference` parameter exists precisely
   * because the delivery channel is invariant (email-only). Callers that
   * resolve a channel for reminders MUST NOT thread it here.
   */
  async sendBookingConfirmation(emailInput: BookingNotificationInput): Promise<void> {
    await this.emailAdapter.sendBookingConfirmation(emailInput);
  }

  /** Booking reminder — transactional, sent via channel(s) matching preference. */
  async sendBookingReminder(
    input: BookingNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    const sends: Promise<void>[] = [];

    if (this.shouldSendEmail(preference) || this.requiresEmailFallback(preference)) {
      sends.push(this.emailAdapter.sendBookingReminder(input));
    }

    if (this.shouldSendSms(preference)) {
      sends.push(this.smsAdapter!.sendBookingReminder(this.toSmsInput(input)));
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

  /** Post-visit thank-you — transactional, no preference routing needed. */
  async sendThankYouEmail(input: ThankYouEmailInput): Promise<void> {
    await this.emailAdapter.sendThankYouEmail(input);
  }
}
