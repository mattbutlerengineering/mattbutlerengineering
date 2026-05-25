import type {
  SmsPort,
  SmsNotificationInput,
  WaitlistUpdateInput,
  WinbackMessageInput,
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
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const dateStr = formatDate(input.date);
    const manageUrl = `${input.manageBaseUrl}?token=${input.manageToken}`;

    const body = `${name}, reminder: ${input.venueName} ${dateStr} at ${input.startTime} for ${input.partySize}. Manage: ${manageUrl}`;
    const trimmed = body.length > 160 ? body.slice(0, 160) : body;

    await this.sendWithRetry(input.guestPhone, trimmed);
  }

  async sendWaitlistUpdate(input: WaitlistUpdateInput): Promise<void> {
    if (!this.client) return;

    const name = input.guestName ?? "Guest";
    const dateStr = formatDate(input.date);
    const manageUrl = `${input.manageBaseUrl}?token=${input.manageToken}`;

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

  private async sendWithRetry(to: string, body: string): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.client!.messages.create({
          to,
          from: this.fromNumber,
          body,
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }
}
