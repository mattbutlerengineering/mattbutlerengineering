import { Resend } from "resend";
import {
  ResendNotificationAdapter,
  TwilioSmsAdapter,
  NotificationDispatcher,
} from "@mbe/notifications";

/**
 * Creates the default NotificationDispatcher backed by Resend (email)
 * and optionally Twilio (SMS). Reads env vars once at creation time.
 */
export function createNotificationPort(): NotificationDispatcher {
  const resendClient = process.env.RESEND_API_KEY
    ? (new Resend(process.env.RESEND_API_KEY) as unknown as {
        emails: {
          send(payload: Record<string, unknown>): Promise<{ id: string }>;
        };
      })
    : null;

  const emailAdapter = new ResendNotificationAdapter({
    resend: resendClient,
    fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
    manageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
  });

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
