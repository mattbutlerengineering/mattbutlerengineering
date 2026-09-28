import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyManageToken } from "../routes/public-reservations.js";
import { reservationService } from "../services/reservation.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

/**
 * Extracts the manage token from the request, preferring an `Authorization:
 * Bearer <token>` header over the legacy `token` query param. The header is
 * checked first so that mutating requests (PATCH/DELETE) never need to put
 * the bearer credential in a URL — the query param remains only for the
 * emailed-link GET/PATCH (view + confirm-attendance) routes.
 */
function extractManageToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const headerToken = authHeader.slice("Bearer ".length).trim();
    if (headerToken) {
      return headerToken;
    }
  }
  const query = request.query as { token?: string } | undefined;
  return query?.token;
}

/**
 * Fastify preHandler that validates a manage token, read from an
 * `Authorization: Bearer <token>` header (checked first) or, for backward
 * compatibility, the `token` query param.
 *
 * On success, decorates `request.managedReservationId` and `request.manageToken`
 * with the reservation ID / raw token extracted, and calls `done` / returns so
 * the route handler runs.
 *
 * On failure, replies with an RFC 7807 Problem Details response:
 *   400 — token missing (neither header nor query param present)
 *   410 — token expired
 *   401 — token invalid or malformed
 */
export async function requireManageToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractManageToken(request);

  if (!token) {
    await reply.status(400).send({
      type: "about:blank",
      title: "Missing Token",
      status: 400,
      detail: "Token query parameter is required",
    });
    return;
  }

  const result = verifyManageToken(token);

  if (!result.valid && result.expired) {
    await reply.status(410).send({
      type: "about:blank",
      title: "Token Expired",
      status: 410,
      detail: "This manage link has expired",
    });
    return;
  }

  if (!result.valid) {
    await reply.status(401).send({
      type: "about:blank",
      title: "Invalid Token",
      status: 401,
      detail: "Invalid or malformed token",
    });
    return;
  }

  // ADR-026 §3.3 item 4: resolve the reservation's venue through the
  // SECURITY DEFINER function (never an unscoped `reservations` read) and run
  // this ownership check inside that venue's RLS context. A NULL resolution
  // (reservation gone, or carries no venue per ADR-026 §2) means there is
  // nothing to check — the route handler's own lookup below reports "not
  // found", matching this preHandler's pre-existing tolerance for a missing
  // reservation.
  const venueId = await resolveVenueId("reservation", result.reservationId!);
  if (venueId) {
    const reservation = await runWithVenueContext(venueId, () =>
      reservationService.getById(result.reservationId!)
    );
    if (reservation && reservation.guestEmail !== result.guestEmail) {
      await reply.status(403).send({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "Token does not match reservation",
      });
      return;
    }
  }

  request.managedReservationId = result.reservationId!;
  request.manageToken = token;
}

declare module "fastify" {
  interface FastifyRequest {
    managedReservationId: string;
    manageToken: string;
  }
}
