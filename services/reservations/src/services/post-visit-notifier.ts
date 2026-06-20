import { createHmac, timingSafeEqual } from "crypto";

const UNSUBSCRIBE_SECRET =
  process.env.UNSUBSCRIBE_TOKEN_SECRET || "dev-unsubscribe-secret-do-not-use-in-prod";

// ─── HMAC token for unsubscribe links ────────────────────────────────────────

/**
 * Generates a permanent (no expiry) HMAC-signed token containing the guestId.
 * Unsubscribe tokens do not expire — they are per-guest identifiers.
 */
export function generateUnsubscribeToken(guestId: string): string {
  if (!guestId) throw new Error("guestId is required");
  const signature = createHmac("sha256", UNSUBSCRIBE_SECRET).update(guestId).digest("hex");
  return Buffer.from(`${guestId}:${signature}`).toString("base64url");
}

export function verifyUnsubscribeToken(token: string): { valid: boolean; guestId?: string } {
  try {
    if (!token) return { valid: false };
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const colonIndex = decoded.lastIndexOf(":");
    if (colonIndex < 1) return { valid: false };

    const guestId = decoded.slice(0, colonIndex);
    const signature = decoded.slice(colonIndex + 1);
    if (!guestId || !signature) return { valid: false };

    const expected = createHmac("sha256", UNSUBSCRIBE_SECRET).update(guestId).digest("hex");

    // Constant-time compare to prevent timing attacks
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return { valid: false };
    if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false };

    return { valid: true, guestId };
  } catch {
    return { valid: false };
  }
}

// ─── Post-visit notifier ──────────────────────────────────────────────────────

export interface ThankYouEmailInput {
  guestEmail: string;
  guestFirstName: string | null;
  venueName: string;
  visitDate: string;
  feedbackUrl: string | null;
  unsubscribeToken: string;
}

export interface PostVisitNotifierDeps {
  sendThankYouEmail(input: ThankYouEmailInput): Promise<void>;
  updateReservationEmailStatus(reservationId: string, status: "SENT" | "FAILED"): Promise<void>;
  updateGuestUnsubscribed(guestId: string): Promise<void>;
}

export interface PostVisitEmailInput {
  reservationId: string;
  guestId: string | null;
  guestEmail: string | null;
  guestFirstName: string | null;
  guestUnsubscribed: boolean;
  venueName: string;
  venuePostVisitEmailEnabled: boolean;
  visitDate: string;
  feedbackUrl: string | null;
}

export interface PostVisitNotifier {
  sendPostVisitEmail(input: PostVisitEmailInput): Promise<void>;
}

/**
 * Creates the production PostVisitNotifier backed by the real Resend sender
 * and Prisma for DB updates.
 */
export function createDefaultPostVisitNotifier(): PostVisitNotifier {
  // Lazy import to avoid circular dependency — notifications.ts imports from here.
  // Defer to call time so tests that mock modules work correctly.
  return createPostVisitNotifier({
    async sendThankYouEmail(input) {
      const { sendThankYouEmail } = await import("../notifications.js");
      await sendThankYouEmail(input);
    },
    async updateReservationEmailStatus(reservationId, status) {
      const { prisma } = await import("./database.js");
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { emailStatus: status },
      });
    },
    async updateGuestUnsubscribed(guestId) {
      const { prisma } = await import("./database.js");
      await prisma.guest.update({
        where: { id: guestId },
        data: { unsubscribed: true },
      });
    },
  });
}

export function createPostVisitNotifier(deps: PostVisitNotifierDeps): PostVisitNotifier {
  const { sendThankYouEmail, updateReservationEmailStatus } = deps;

  return {
    async sendPostVisitEmail(input: PostVisitEmailInput): Promise<void> {
      const {
        reservationId,
        guestId,
        guestEmail,
        guestFirstName,
        guestUnsubscribed,
        venueName,
        venuePostVisitEmailEnabled,
        visitDate,
        feedbackUrl,
      } = input;

      // Gate checks — skip silently when conditions not met
      if (!venuePostVisitEmailEnabled) return;
      if (!guestEmail) return;
      if (guestUnsubscribed) return;

      const unsubscribeToken = guestId ? generateUnsubscribeToken(guestId) : "";

      try {
        await sendThankYouEmail({
          guestEmail,
          guestFirstName,
          venueName,
          visitDate,
          feedbackUrl,
          unsubscribeToken,
        });
        await updateReservationEmailStatus(reservationId, "SENT");
      } catch {
        await updateReservationEmailStatus(reservationId, "FAILED");
      }
    },
  };
}
