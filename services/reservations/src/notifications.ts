import { Resend } from "resend";
import {
  ResendNotificationAdapter,
  TwilioSmsAdapter,
  NotificationDispatcher,
} from "@mbe/notifications";
import { getPublicApiBaseUrlConfig } from "./config/public-api-base-url.js";

/**
 * Reads Resend env vars once and constructs a ResendNotificationAdapter.
 * Single source of truth for RESEND_API_KEY / EMAIL_FROM / MANAGE_BASE_URL /
 * PUBLIC_API_BASE_URL. Returns the adapter regardless of whether the API key is
 * set — the adapter no-ops on sends when resend is null (key missing).
 *
 * MANAGE_BASE_URL is the WEB origin (the manage/cancel/modify page);
 * PUBLIC_API_BASE_URL is the API origin (the unsubscribe endpoint). They are
 * two different destinations and are now declared explicitly in
 * infrastructure/pulumi/index.ts rather than inferred from each other (#4517).
 * PUBLIC_API_BASE_URL deliberately has no code default — see
 * ./config/public-api-base-url.js.
 */
export function createResendAdapter(): ResendNotificationAdapter {
  const resendClient = process.env.RESEND_API_KEY
    ? (new Resend(process.env.RESEND_API_KEY) as unknown as {
        emails: {
          send(payload: Record<string, unknown>): Promise<{ id: string }>;
        };
      })
    : null;

  const { baseUrl: publicApiBaseUrl } = getPublicApiBaseUrlConfig({
    baseUrl: process.env.PUBLIC_API_BASE_URL,
    emailEnabled: resendClient !== null,
  });

  return new ResendNotificationAdapter({
    resend: resendClient,
    fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
    manageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
    publicApiBaseUrl,
  });
}

/**
 * Creates the default NotificationDispatcher backed by Resend (email)
 * and optionally Twilio (SMS). Reads env vars once at creation time.
 */
export function createNotificationPort(): NotificationDispatcher {
  const emailAdapter = createResendAdapter();

  const smsAdapter =
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
      ? new TwilioSmsAdapter({
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          client: require("twilio")(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          ) as never,
          fromNumber: process.env.TWILIO_FROM_NUMBER,
        })
      : null;

  return new NotificationDispatcher({
    emailAdapter,
    smsAdapter,
    smsManageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
  });
}
