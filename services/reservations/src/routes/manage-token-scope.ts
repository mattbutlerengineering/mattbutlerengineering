import type {
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
} from "fastify";
import type { Reservation } from "@mbe/types";
import { reservationService } from "../services/reservation.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import { verifyManageToken } from "./public-reservations.js";
import { VENUE_SCOPE } from "./venue-scope.js";

/**
 * The manage-token source for venue scope (sibling of `venueScoped`, ADR-026
 * §3.3 item 4). Replaces the `requireManageToken` preHandler plus the
 * resolve-and-reload every handler repeated: per request the token is
 * verified, the reservation's venue is resolved ONCE (SECURITY DEFINER
 * `app_resolve_venue_id`), the reservation is loaded ONCE inside that venue's
 * RLS context, the token's signed email is checked against it, and the handler
 * receives `{ venueId, reservation, token }` already inside
 * `runWithVenueContext`.
 *
 * Deny statuses, unchanged from the preHandler: 400 token missing, 410
 * expired, 401 invalid/malformed, 403 token email does not match the
 * reservation. A venue that does not resolve or a reservation that is gone is
 * the route's own contract (`missing`: 404 JSON on manage/cancel/modify, 401
 * HTML on confirm-attendance), because those bytes are public API.
 *
 * Rate limiting stays on the route's own `config.rateLimit`.
 */

type Handler<RG extends RouteGenericInterface> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RG
>;
type RequestOf<RG extends RouteGenericInterface> = Parameters<Handler<RG>>[0];
type ReplyOf<RG extends RouteGenericInterface> = Parameters<Handler<RG>>[1];

export interface ManageTokenScope {
  readonly venueId: string;
  readonly reservation: Reservation;
  readonly token: string;
}

export interface ManageTokenScopeSpec<RG extends RouteGenericInterface> {
  /** The route's own answer when the venue or the reservation cannot be found. */
  readonly missing: (reply: ReplyOf<RG>, request: RequestOf<RG>) => unknown;
}

export type ManageTokenHandler<RG extends RouteGenericInterface> = (
  request: RequestOf<RG>,
  reply: ReplyOf<RG>,
  scope: ManageTokenScope
) => ReturnType<Handler<RG>>;

/**
 * Prefers `Authorization: Bearer <token>` so mutating requests never need the
 * credential in a URL; the `token` query param remains for emailed links.
 */
function extractManageToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const headerToken = authHeader.slice("Bearer ".length).trim();
    if (headerToken) return headerToken;
  }
  return (request.query as { token?: string } | undefined)?.token;
}

function deny(reply: FastifyReply, status: number, title: string, detail: string): FastifyReply {
  return reply.status(status).send({ type: "about:blank", title, status, detail });
}

export function manageTokenScoped<RG extends RouteGenericInterface = RouteGenericInterface>(
  spec: ManageTokenScopeSpec<RG>,
  handler: ManageTokenHandler<RG>
): Handler<RG> {
  async function scopedHandler(request: RequestOf<RG>, reply: ReplyOf<RG>): Promise<unknown> {
    const token = extractManageToken(request);
    if (!token) {
      return deny(reply, 400, "Missing Token", "Token query parameter is required");
    }

    const result = verifyManageToken(token);
    if (!result.valid && result.expired) {
      return deny(reply, 410, "Token Expired", "This manage link has expired");
    }
    if (!result.valid) {
      return deny(reply, 401, "Invalid Token", "Invalid or malformed token");
    }

    const reservationId = result.reservationId!;
    const venueId = await resolveVenueId("reservation", reservationId);
    if (!venueId) return spec.missing(reply, request);

    return runWithVenueContext(venueId, async () => {
      const reservation = await reservationService.getById(reservationId);
      if (!reservation) return spec.missing(reply, request);
      if (reservation.guestEmail !== result.guestEmail) {
        return deny(reply, 403, "Forbidden", "Token does not match reservation");
      }
      return handler(request, reply, { venueId, reservation, token });
    });
  }

  Object.defineProperty(scopedHandler, VENUE_SCOPE, { value: "token:manage/public" });
  return scopedHandler as unknown as Handler<RG>;
}
