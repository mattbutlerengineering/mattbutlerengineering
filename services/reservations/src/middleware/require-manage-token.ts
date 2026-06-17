import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyManageToken } from "../routes/public-reservations.js";

/**
 * Fastify preHandler that validates the `token` query param as a manage token.
 *
 * On success, decorates `request.managedReservationId` with the reservation ID
 * extracted from the token and calls `done` / returns so the route handler runs.
 *
 * On failure, replies with an RFC 7807 Problem Details response:
 *   400 — token query param missing
 *   410 — token expired
 *   401 — token invalid or malformed
 */
export async function requireManageToken(
  request: FastifyRequest<{ Querystring: { token?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { token } = request.query;

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

  request.managedReservationId = result.reservationId!;
}

declare module "fastify" {
  interface FastifyRequest {
    managedReservationId: string;
  }
}
