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
  /** Receives per-channel delivery failures that are absorbed (another channel delivered). */
  logger?: DispatcherLogger;
}

/** Narrow logger shape — satisfied by `FastifyBaseLogger`. */
export interface DispatcherLogger {
  warn(details: object, msg: string): void;
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
  private readonly logger: DispatcherLogger | null;

  constructor(config: NotificationDispatcherConfig) {
    this.emailAdapter = config.emailAdapter;
    this.smsAdapter = config.smsAdapter;
    this.smsManageBaseUrl = config.smsManageBaseUrl ?? "";
    this.logger = config.logger ?? null;
  }

  private toSmsInput(input: BookingNotificationInput): SmsNotificationInput {
    return {
      reservationId: input.reservationId,
      date: input.date,
      startTime: input.startTime,
      venueTimezone: input.venueTimezone,
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

  private shouldSendSms(preference: CommunicationPreference, guestPhone?: string | null): boolean {
    return (
      (preference === "sms_only" || preference === "both") &&
      this.smsAdapter !== null &&
      Boolean(guestPhone?.trim())
    );
  }

  /**
   * Returns true when an sms_only guest must receive a message via email
   * because SMS cannot be delivered (no SMS adapter configured, or the guest
   * has no phone number).
   *
   * Used for messages that CAN travel via SMS (e.g. reminders) — when the
   * SMS channel is unavailable, we fall back to email rather than silently
   * dropping the notification.
   */
  private requiresEmailFallback(
    preference: CommunicationPreference,
    guestPhone?: string | null
  ): boolean {
    return preference === "sms_only" && !this.shouldSendSms(preference, guestPhone);
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

  /**
   * Booking reminder — transactional, sent via channel(s) matching preference.
   *
   * Channels are settled independently. If at least one channel delivered, a
   * failure on another is logged and NOT rethrown: the queue retries the whole
   * job, which would re-send the already-delivered channel (the guest would get
   * the same reminder email up to 3x). Only when nothing was delivered does the
   * error propagate so BullMQ retries safely.
   */
  async sendBookingReminder(
    input: BookingNotificationInput,
    preference: CommunicationPreference
  ): Promise<void> {
    const sends: { channel: "email" | "sms"; promise: Promise<void> }[] = [];

    if (
      this.shouldSendEmail(preference) ||
      this.requiresEmailFallback(preference, input.guestPhone)
    ) {
      sends.push({ channel: "email", promise: this.emailAdapter.sendBookingReminder(input) });
    }

    if (this.shouldSendSms(preference, input.guestPhone)) {
      sends.push({
        channel: "sms",
        promise: this.smsAdapter!.sendBookingReminder(this.toSmsInput(input)),
      });
    }

    const results = await Promise.allSettled(sends.map((s) => s.promise));
    const failures = results.flatMap((r, i) =>
      r.status === "rejected" ? [{ channel: sends[i]!.channel, reason: r.reason as unknown }] : []
    );
    if (failures.length === 0) return;
    if (failures.length === results.length) throw failures[0]!.reason;

    for (const { channel, reason } of failures) {
      this.logger?.warn(
        { channel, reservationId: input.reservationId, err: reason },
        "Reminder channel failed after another channel delivered; not retrying to avoid duplicates"
      );
    }
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
