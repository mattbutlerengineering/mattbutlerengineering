import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, Reservation } from "@mbe/types";
import { AppError, publicReservationBodyJsonSchema } from "@mbe/types";
import { createHmac, timingSafeEqual } from "crypto";
import { venueService } from "../services/venue.js";
import { confirmHold } from "../services/confirm-hold.js";
import { resolveGuestLink } from "../services/guest-link.js";
import { withoutGuestLink } from "../services/serializers.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { decrementHoldCount } from "../middleware/public-rate-limit.js";
import { getManageTokenConfig } from "../config/manage-token.js";

const TOKEN_SECRET = getManageTokenConfig({
  nodeEnv: process.env.NODE_ENV,
  secret: process.env.MANAGE_TOKEN_SECRET,
}).secret;

const SESSION_ID_HEADER = "x-session-id";

// One detail for "no such hold" and for "not your hold" alike. The hold id is a
// low-entropy, guessable cuid (see public-holds.ts), so any wording that told
// the two apart would be a hold-id oracle — an attacker could enumerate ids and
// learn which are live. Deliberately says nothing about sessions.
const HOLD_NOT_FOUND_DETAIL = "Hold not found.";

export function generateManageToken(reservationId: string, guestEmail: string): string {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${reservationId}:${guestEmail}:${expiry}`;
  const signature = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

// HMAC signatures are hex-encoded digests. Comparing them with `!==` is
// timing-sensitive — it short-circuits on the first differing byte, which
// leaks timing information an attacker could use to forge a valid
// signature. `timingSafeEqual` throws on length mismatch, so the length
// check must happen first.
export function secureCompareHex(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

export function verifyManageToken(token: string): {
  valid: boolean;
  expired?: boolean;
  reservationId?: string;
  guestEmail?: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length < 4) return { valid: false };

    const signature = parts.pop()!;
    // Pop expiry from the right, shift reservationId from the left, then
    // rejoin whatever remains as the email. This handles RFC-valid emails
    // containing colons (e.g. "user:tag@example.com") without breaking the
    // HMAC payload reconstruction.
    const expiryStr = parts.pop()!;
    const reservationId = parts.shift()!;
    const guestEmail = parts.join(":");
    const payload = `${reservationId}:${guestEmail}:${expiryStr}`;

    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (!secureCompareHex(signature, expected)) return { valid: false };

    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) return { valid: false, expired: true };

    return { valid: true, reservationId, guestEmail };
  } catch {
    return { valid: false };
  }
}

interface PublicReservationResponse {
  reservation: Reservation;
  manageToken: string;
}

export const publicReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { slug: string };
    Body: {
      holdId: string;
      guestName: string;
      guestEmail: string;
      guestPhone?: string;
      specialRequests?: string;
    };
    Reply: ApiResponse<PublicReservationResponse>;
  }>(
    "/:slug/reservations",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Create reservation from hold (public)",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
        body: publicReservationBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { holdId, guestName, guestEmail, guestPhone, specialRequests } = request.body;
      const ip = request.ip;

      // The high-entropy sessionId minted at hold creation is this caller's
      // capability token and the only proof the hold is theirs — mirrors the
      // release path in public-holds.ts. Reading it here is what makes
      // confirmHold's SESSION_MISMATCH check run at all: calling confirmHold
      // without a sessionId skipped ownership entirely, so anyone who guessed a
      // live holdId could confirm another guest's hold under their own name.
      const sessionId = request.headers[SESSION_ID_HEADER];
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        throw new AppError(
          "SESSION_REQUIRED",
          401,
          `Pass the hold's session ID via the ${SESSION_ID_HEADER} header to confirm it.`
        );
      }

      const venue = await venueService.getBySlug(slug);
      if (!venue) {
        throw new AppError("VENUE_NOT_FOUND", 404, `No venue found with slug '${slug}'.`);
      }

      // Read-only recognition by the contact the guest typed — never by an id in the body,
      // which the schema does not declare and this handler never reads (SC12). Both lookups
      // run whenever their input is present, so a known contact costs the same as an unknown
      // one (SC11). Without a supplied id `resolveGuestLink` cannot reject, so the fallback
      // branch only keeps the union honest.
      const link = await resolveGuestLink({ venueId: venue.id, guestEmail, guestPhone });

      const result = await confirmHold({
        holdId,
        sessionId,
        guestDetails: {
          guestName,
          guestEmail,
          guestPhone,
          notes: specialRequests,
          guestId: link.ok ? (link.guestId ?? undefined) : undefined,
        },
      });

      if (!result.success) {
        // A hold the caller does not own answers exactly as a hold that does not
        // exist — same status, same code, same detail. See HOLD_NOT_FOUND_DETAIL.
        if (result.errorCode === "NOT_FOUND" || result.errorCode === "SESSION_MISMATCH") {
          throw new AppError("NOT_FOUND", 404, HOLD_NOT_FOUND_DETAIL);
        }

        const statusMap: Record<string, number> = {
          EXPIRED: 410,
          CONFLICT: 409,
          PACING_EXCEEDED: 422,
        };
        const httpStatus = statusMap[result.errorCode] ?? 409;
        throw new AppError(result.errorCode, httpStatus, result.error ?? "Booking failed");
      }

      decrementHoldCount(ip);

      const manageToken = generateManageToken(result.reservation.id, guestEmail);

      // Fire-and-forget: send confirmation + schedule reminders (non-blocking)
      fastify.bookingNotifier
        .scheduleBookingNotifications(result.reservation, manageToken)
        .catch((err) => fastify.log.error({ err }, "Failed to schedule booking notifications"));

      // The notifier above gets the linked reservation; the caller never learns of the link.
      return reply.status(201).send({
        data: {
          reservation: withoutGuestLink(result.reservation),
          manageToken,
        },
      });
    }
  );
};
