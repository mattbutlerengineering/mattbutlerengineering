import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, Reservation } from "@mbe/types";
import { createHmac } from "crypto";
import { venueService } from "../services/venue.js";
import { holdService } from "../services/hold.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { decrementHoldCount } from "../middleware/public-rate-limit.js";

const TOKEN_SECRET = process.env.MANAGE_TOKEN_SECRET || "dev-secret-do-not-use-in-prod";

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
    const payload = parts.join(":");
    const [reservationId, guestEmail, expiryStr] = parts;

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
        return reply.status(404).send({
          type: "https://httpproblems.com/http-status/404",
          title: "Venue Not Found",
          status: 404,
          detail: `No venue found with slug '${slug}'.`,
        } as never);
      }

      const result = await holdService.confirm(
        holdId,
        { guestName, guestEmail, guestPhone, notes: specialRequests },
        "public"
      );

      if (!result.success || !result.reservation) {
        const status = result.error?.includes("expired") ? 410 : 409;
        return reply.status(status).send({
          type: `https://httpproblems.com/http-status/${status}`,
          title: status === 410 ? "Hold Expired" : "Booking Failed",
          status,
          detail: result.error ?? "Could not complete booking.",
        } as never);
      }

      decrementHoldCount(ip);

      const manageToken = generateManageToken(result.reservation.id, guestEmail);

      return reply.status(201).send({
        data: {
          reservation: result.reservation,
          manageToken,
        },
      });
    }
  );
};
