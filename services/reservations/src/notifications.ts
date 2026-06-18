import { Resend } from "resend";
import {
  ResendNotificationAdapter,
  TwilioSmsAdapter,
  NotificationDispatcher,
} from "@mbe/notifications";

/**
 * Reads Resend env vars once and constructs a ResendNotificationAdapter.
 * Single source of truth for RESEND_API_KEY / EMAIL_FROM / MANAGE_BASE_URL.
 * Returns the adapter regardless of whether the API key is set — the adapter
 * no-ops on sends when resend is null (key missing).
 */
export function createResendAdapter(): ResendNotificationAdapter {
  const resendClient = process.env.RESEND_API_KEY
    ? (new Resend(process.env.RESEND_API_KEY) as unknown as {
        emails: {
          send(payload: Record<string, unknown>): Promise<{ id: string }>;
        };
      })
    : null;

  return new ResendNotificationAdapter({
    resend: resendClient,
    fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
    manageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
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

  return new NotificationDispatcher({ emailAdapter, smsAdapter });
}
