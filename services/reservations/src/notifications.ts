import { Resend } from "resend";
import { ResendNotificationAdapter } from "@mbe/notifications";
import type { NotificationPort } from "@mbe/notifications";

/**
 * Creates the default NotificationPort backed by Resend.
 * Reads env vars once at creation time.
 */
export function createNotificationPort(): NotificationPort {
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
