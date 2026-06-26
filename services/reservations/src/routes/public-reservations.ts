import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, Reservation } from "@mbe/types";
import { AppError } from "@mbe/types";
import { createHmac } from "crypto";
import { venueService } from "../services/venue.js";
import { confirmHold } from "../services/confirm-hold.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { decrementHoldCount } from "../middleware/public-rate-limit.js";
import { getManageTokenConfig } from "../config/manage-token.js";

const TOKEN_SECRET = getManageTokenConfig({
  nodeEnv: process.env.NODE_ENV,
  secret: process.env.MANAGE_TOKEN_SECRET,
}).secret;

export function generateManageToken(reservationId: string, guestEmail: string): string {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${reservationId}:${guestEmail}:${expiry}`;
  const signature = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
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
    if (signature !== expected) return { valid: false };

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
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { holdId, guestName, guestEmail, guestPhone, specialRequests } = request.body;
      const ip = request.ip;

      const venue = await venueService.getBySlug(slug);
      if (!venue) {
        throw new AppError("VENUE_NOT_FOUND", 404, `No venue found with slug '${slug}'.`);
      }

      const result = await confirmHold({
        holdId,
        guestDetails: { guestName, guestEmail, guestPhone, notes: specialRequests },
      });

      if (!result.success) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          EXPIRED: 410,
          SESSION_MISMATCH: 403,
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

      return reply.status(201).send({
        data: {
          reservation: result.reservation,
          manageToken,
        },
      });
    }
  );
};
