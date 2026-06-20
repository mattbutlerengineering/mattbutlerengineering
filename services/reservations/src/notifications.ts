import { Resend } from "resend";
import {
  ResendNotificationAdapter,
  TwilioSmsAdapter,
  NotificationDispatcher,
} from "@mbe/notifications";
import type { ThankYouEmailInput } from "./services/post-visit-notifier.js";

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

  return new NotificationDispatcher({
    emailAdapter,
    smsAdapter,
    smsManageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
  });
}

/**
 * Escapes characters that have special meaning in HTML.
 * Used to prevent HTML/script injection from stored-data values.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns the URL if its scheme is http or https; otherwise returns null.
 * Prevents javascript:, data:, and other dangerous schemes from entering the HTML.
 */
function sanitizeFeedbackUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Sends a post-visit thank-you email via Resend.
 * Uses the same RESEND_API_KEY / EMAIL_FROM / MANAGE_BASE_URL env vars as the main notification adapter.
 * Returns without error when RESEND_API_KEY is not set (no-op).
 */
export async function sendThankYouEmail(input: ThankYouEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const fromAddress = process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com";
  const baseUrl = process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com";

  const { guestEmail, guestFirstName, venueName, visitDate, feedbackUrl, unsubscribeToken } = input;

  const safeName = escapeHtml(guestFirstName ?? "Guest");
  const safeVenueName = escapeHtml(venueName);
  const safeVisitDate = escapeHtml(visitDate);
  const safeUnsubscribeUrl = escapeHtml(
    `${baseUrl}/public/v1/guests/unsubscribe?token=${unsubscribeToken}`
  );

  const safeFeedbackUrl = feedbackUrl ? sanitizeFeedbackUrl(feedbackUrl) : null;
  const feedbackSection = safeFeedbackUrl
    ? `<p><a href="${escapeHtml(safeFeedbackUrl)}">Share your feedback</a> — it helps us improve.</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Thank you for visiting ${safeVenueName}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2>Thank you, ${safeName}!</h2>
  <p>We loved having you at <strong>${safeVenueName}</strong> on ${safeVisitDate}.</p>
  <p>We hope to see you again soon.</p>
  ${feedbackSection}
  <hr style="margin-top:32px" />
  <p style="font-size:0.8em;color:#888">
    <a href="${safeUnsubscribeUrl}">Unsubscribe</a> from post-visit emails.
  </p>
</body>
</html>`;

  await (
    resend as unknown as { emails: { send(p: Record<string, unknown>): Promise<unknown> } }
  ).emails.send({
    from: fromAddress,
    to: guestEmail,
    subject: `Thank you for visiting ${venueName}!`,
    html,
  });
}
