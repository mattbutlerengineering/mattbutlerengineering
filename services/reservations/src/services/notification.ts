import { createHmac } from "crypto";
import { Resend } from "resend";
import { prisma } from "./database.js";

function getUnsubscribeSecret(): string {
  return process.env.UNSUBSCRIBE_SECRET ?? process.env.MANAGE_TOKEN_SECRET ?? "dev-secret-do-not-use";
}

function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com";
}

function getBaseUrl(): string {
  return process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com";
}

function buildUnsubscribeToken(guestId: string): string {
  const sig = createHmac("sha256", getUnsubscribeSecret()).update(guestId).digest("hex");
  return `${sig}.${guestId}`;
}

function buildEmailHtml(opts: {
  guestFirstName: string;
  venueName: string;
  visitDate: string;
  feedbackUrl?: string | null;
  unsubscribeUrl: string;
}): string {
  const feedbackSection = opts.feedbackUrl
    ? `<p>We&apos;d love to hear your thoughts — <a href="${opts.feedbackUrl}">leave us feedback</a>.</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h1>Thank you for visiting ${opts.venueName}!</h1>
  <p>Hi ${opts.guestFirstName},</p>
  <p>We hope you enjoyed your visit on ${opts.visitDate}. It was a pleasure having you with us.</p>
  ${feedbackSection}
  <p>We look forward to seeing you again soon.</p>
  <p style="margin-top:48px;font-size:12px;color:#888">
    <a href="${opts.unsubscribeUrl}">Unsubscribe</a> from future emails.
  </p>
</body>
</html>`;
}

/**
 * Send a post-visit thank-you email for a completed reservation.
 * Fire-and-forget safe — never throws.
 */
export async function sendPostVisitEmail(reservationId: string): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      guest: true,
      venue: true,
    },
  });

  if (!reservation) return;

  const { guest, venue } = reservation;

  // Guard: need linked guest with email
  if (!guest || !guest.email) return;

  // Guard: guest must not have unsubscribed
  if (guest.unsubscribed) return;

  // Guard: venue must have postVisitEmailEnabled
  const settings = venue?.settings as Record<string, unknown> | null | undefined;
  if (!settings?.postVisitEmailEnabled) return;

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  const resend = new Resend(resendApiKey);

  const guestFirstName = guest.name.split(" ")[0] ?? guest.name;
  const visitDate = reservation.date.toISOString().split("T")[0] ?? "";
  const feedbackUrl = settings.feedbackUrl as string | null | undefined;
  const unsubscribeUrl = `${getBaseUrl()}/public/v1/guests/unsubscribe?token=${buildUnsubscribeToken(guest.id)}`;

  const html = buildEmailHtml({
    guestFirstName,
    venueName: venue?.name ?? "the venue",
    visitDate,
    feedbackUrl,
    unsubscribeUrl,
  });

  try {
    await (
      resend as unknown as {
        emails: { send(p: Record<string, unknown>): Promise<{ id: string }> };
      }
    ).emails.send({
      from: getEmailFrom(),
      to: guest.email,
      subject: `Thank you for visiting ${venue?.name ?? "us"}!`,
      html,
    });

    await prisma.reservation.update({
      where: { id: reservationId },
      data: { emailStatus: "SENT" },
    });
  } catch {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { emailStatus: "FAILED" },
    });
  }
}
