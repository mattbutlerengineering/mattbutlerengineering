import { retry } from "./retry.js";
import { toVenueLocalTime } from "./venue-time.js";
import { buildManageUrl } from "./manage-url.js";
import type {
  SmsPort,
  SmsNotificationInput,
  WaitlistUpdateInput,
  WinbackMessageInput,
  WaitlistAddedInput,
  WaitlistPositionUpdateInput,
  WaitlistTableReadyInput,
} from "./sms-port.js";

interface TwilioMessages {
  create(params: {
    to: string;
    from: string;
    body: string;
  }): Promise<{ sid: string; status: string }>;
}

interface TwilioClient {
  messages: TwilioMessages;
}

export interface TwilioSmsAdapterConfig {
  client: TwilioClient | null;
  fromNumber: string;
  /** Delay in ms between retry attempts (default: 1000). Used in tests to speed up. */
  retryDelayMs?: number;
}

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function formatDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD" format
  const [year, month, day] = dateStr.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

const SMS_SEGMENT_LIMIT = 160;

/**
 * Picks the most informative candidate that fits one SMS segment. The manage
 * link is never cut: if even the shortest candidate overflows (the signed
 * token alone is ~170 chars), it is sent whole as a multi-segment message,
 * because a truncated link is a dead link.
 */
function fitReminderBody(candidates: readonly string[]): string {
  return (
    candidates.find((c) => c.length <= SMS_SEGMENT_LIMIT) ?? candidates[candidates.length - 1]!
  );
}

export class TwilioSmsAdapter implements SmsPort {
  private readonly client: TwilioClient | null;
  private readonly fromNumber: string;
  private readonly retryDelayMs: number;

  constructor(config: TwilioSmsAdapterConfig) {
    this.client = config.client;
    this.fromNumber = config.fromNumber;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async sendBookingReminder(input: SmsNotificationInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const when = toVenueLocalTime(input.startTime, input.venueTimezone, input.date);
    const dateStr = formatDate(when.date);
    const manageUrl = buildManageUrl(input.manageBaseUrl, input.manageToken);

    await this.sendWithRetry(
      input.guestPhone,
      fitReminderBody([
        `${name}, reminder: ${input.venueName} ${dateStr} at ${when.display} for ${input.partySize}. Manage: ${manageUrl}`,
        `${name}, reminder: ${input.venueName} ${dateStr} ${when.display}. Manage: ${manageUrl}`,
        `${input.venueName} ${dateStr} ${when.display}: ${manageUrl}`,
      ])
    );
  }

  async sendWaitlistUpdate(input: WaitlistUpdateInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const dateStr = formatDate(input.date);
    const manageUrl = buildManageUrl(input.manageBaseUrl, input.manageToken);

    const body = `${name}, you&apos;re on the waitlist at ${input.venueName} for ${dateStr}, party of ${input.partySize}. Check: ${manageUrl}`;
    // Strip HTML entities for SMS
    const smsBody = body.replace(/&apos;/g, "'");
    const trimmed = smsBody.length > 160 ? smsBody.slice(0, 160) : smsBody;

    await this.sendWithRetry(input.guestPhone, trimmed);
  }

  async sendWinbackMessage(input: WinbackMessageInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const url = input.manageBaseUrl;

    const body = `${name}, we miss you at ${input.venueName}! Book your next visit: ${url}`;
    const trimmed = body.length > 160 ? body.slice(0, 160) : body;

    await this.sendWithRetry(input.guestPhone, trimmed);
  }

  async sendWaitlistAdded(input: WaitlistAddedInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const wait =
      input.estimatedWaitMinutes === null
        ? "estimate unavailable"
        : `est. ${input.estimatedWaitMinutes} min wait`;
    const body = `${name}, you're #${input.position}, ${wait}. We'll text when your table is ready.`;
    const trimmed = body.length > 160 ? body.slice(0, 160) : body;

    await this.sendWithRetry(input.guestPhone, trimmed);
  }

  async sendWaitlistPositionUpdate(input: WaitlistPositionUpdateInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const wait =
      input.estimatedWaitMinutes === null ? "" : `, est. ${input.estimatedWaitMinutes} min`;
    const body = `${name}, update: you're now #${input.position}${wait}.`;
    const trimmed = body.length > 160 ? body.slice(0, 160) : body;

    await this.sendWithRetry(input.guestPhone, trimmed);
  }

  async sendWaitlistTableReady(input: WaitlistTableReadyInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const body = `${name}, your table is ready! Please check in within 5 minutes.`;
    const trimmed = body.length > 160 ? body.slice(0, 160) : body;

    await this.sendWithRetry(input.guestPhone, trimmed);
  }

  private sendWithRetry(to: string, body: string): Promise<void> {
    return retry(
      () =>
        this.client!.messages.create({
          to,
          from: this.fromNumber,
          body,
        }).then(() => undefined),
      {
        maxRetries: MAX_RETRIES - 1,
        baseDelayMs: this.retryDelayMs,
        jitter: true,
      }
    );
  }
}
