import type { SmsPort } from "./sms-port.js";

/** Minimal HTTP POST client interface — injectable for testing. */
export interface HttpPostClient {
  post(
    url: string,
    headers: Record<string, string>,
    body: string
  ): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

export interface TwilioAdapterConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  /** Optional HTTP client — defaults to globalThis.fetch. */
  httpClient?: HttpPostClient;
}

function toBase64(str: string): string {
  // Pure ES2022 base64 encoding without Buffer or btoa
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    result +=
      chars[a >> 2] +
      chars[((a & 3) << 4) | (b >> 4)] +
      (i - 1 < str.length ? chars[((b & 15) << 2) | (c >> 6)] : "=") +
      (i < str.length + 1 ? chars[c & 63] : "=");
  }
  return result;
}

/**
 * Sends SMS via Twilio REST API.
 * Uses injectable httpClient for testability; defaults to globalThis.fetch.
 */
export class TwilioSmsAdapter implements SmsPort {
  private readonly config: TwilioAdapterConfig;

  constructor(config: TwilioAdapterConfig) {
    this.config = config;
  }

  async sendSms(to: string, body: string): Promise<void> {
    const { accountSid, authToken, fromNumber, httpClient } = this.config;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const formBody = [
      `To=${encodeURIComponent(to)}`,
      `From=${encodeURIComponent(fromNumber)}`,
      `Body=${encodeURIComponent(body)}`,
    ].join("&");

    const credentials = toBase64(`${accountSid}:${authToken}`);
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    };

    const client = httpClient ?? defaultHttpClient;
    const response = await client.post(url, headers, formBody);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio SMS failed (${response.status}): ${text}`);
    }
  }
}

// Default client using globalThis.fetch (Node 18+ / browser)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gFetch = (globalThis as any).fetch as (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const defaultHttpClient: HttpPostClient = {
  post: (url, headers, body) => gFetch(url, { method: "POST", headers, body }),
};
