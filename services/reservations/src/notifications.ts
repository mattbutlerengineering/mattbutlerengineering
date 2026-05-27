import { Resend } from "resend";
import {
  ResendNotificationAdapter,
  TwilioSmsAdapter,
  NotificationDispatcher,
} from "@mbe/notifications";

function buildResendClient(): {
  emails: { send(payload: Record<string, unknown>): Promise<{ id: string }> };
} | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY) as unknown as {
    emails: { send(payload: Record<string, unknown>): Promise<{ id: string }> };
  };
}

function buildTwilioClient(): {
  messages: {
    create(params: { body: string; from: string; to: string }): Promise<{ sid: string }>;
  };
} | null {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  // Lazily require twilio only when credentials are present
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require("twilio") as (
    sid: string,
    token: string
  ) => {
    messages: {
      create(params: { body: string; from: string; to: string }): Promise<{ sid: string }>;
    };
  };
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

export function createNotificationDispatcher(): NotificationDispatcher {
  const emailAdapter = new ResendNotificationAdapter({
    resend: buildResendClient(),
    fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
    manageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
  });

  const twilioClient = buildTwilioClient();
  const smsAdapter = twilioClient
    ? new TwilioSmsAdapter({
        twilio: twilioClient,
        fromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
      })
    : null;

  return new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
}
