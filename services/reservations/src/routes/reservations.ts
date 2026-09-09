import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import type {
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
  WalkInRequest,
  ApiResponse,
  ProblemDetails,
  PaginatedResponse,
} from "@mbe/types";
import {
  createProblemDetails,
  listReservationsQueryJsonSchema,
  listMyReservationsQueryJsonSchema,
  walkInBodyJsonSchema,
  createReservationBodyJsonSchema,
  updateReservationBodyJsonSchema,
} from "@mbe/types";
import {
  requireAuth,
  optionalAuth,
  requireOwnershipOrAdmin,
  requireVenueAccess,
  type VenueIdResolver,
} from "@mbe/auth/fastify";

import { parsePaginationQuery, createListResponseSchema } from "@mbe/database";
import { reservationService, ReservationTransitionError } from "../services/reservation.js";
import { cancelReservationWithDeposit } from "../services/reservation-cancellation.js";
import { recordNoShow } from "../services/reservation-no-show.js";
import { isPartySizeDepositBlocked } from "../services/reservation-modification.js";
import { venueService } from "../services/venue.js";
import { guestService } from "../services/guest.js";
import { resolveReservationGuestEmail, resolveCurrentUserEmail } from "./reservation-owner.js";
import { generateManageToken } from "./public-reservations.js";
import { venueIdFromBody } from "./venue-access.js";

/**
 * Venue-id resolver for the staff reservations list (#4865, Sentry
 * HOSPITALITY-6). The route accepts either `venueId` or `guestId` as a
 * filter — the CRM guest card sends only `guestId` — so the resolver must
 * fall back to the filtered guest's venue when no `venueId` is present.
 * Without this, a caller who supplied only `guestId` was undeterminable and
 * always 403'd; had the guest's own `venueId` been silently substituted for
 * the *whole-venue* filter instead, that would leak every other guest's
 * reservations at that venue, so falling through to a 403 (never guessing) is
 * deliberate.
 */
const resolveReservationsListVenueId: VenueIdResolver = async (request) => {
  const query = request.query as { venueId?: unknown; guestId?: unknown } | null | undefined;
  if (typeof query?.venueId === "string") {
    return query.venueId;
  }
  if (typeof query?.guestId === "string") {
    const guest = await guestService.getById(query.guestId);
    return guest?.venueId ?? null;
  }
  return null;
};

const requireReservationOwnerOrAdmin = requireOwnershipOrAdmin(
  resolveReservationGuestEmail((id) => reservationService.getById(id)),
  resolveCurrentUserEmail
);

export const reservationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Shared cancel adapter for the PATCH (status: CANCELLED) and DELETE
   * routes below. Both routes are guarded by `requireReservationOwnerOrAdmin`,
   * which admits the reservation OWNER (guest email match), not only an
   * admin — so `isAdmin` here MUST come from the verified
   * `request.authorization.isAdmin` flag set by that guard, never from a
   * client-supplied value, otherwise an owner could get the fee-waived
   * staff refund on their own cancellation. Admins get staff semantics
   * (waived fee, deposit refunded in full); a non-admin owner gets guest
   * semantics (the venue's cancellation-fee policy applies) — see
   * {@link cancelReservationWithDeposit}. A manage token is generated (not
   * faked) so the guest cancellation email still carries a working manage
   * link when the reservation has a guest email on file.
   */
  async function cancelReservationForRequest(
    reservation: Reservation,
    logger: FastifyBaseLogger,
    isAdmin: boolean,
    options: { cancellationReason?: string; cancellationNote?: string } = {}
  ) {
    const manageToken = reservation.guestEmail
      ? generateManageToken(reservation.id, reservation.guestEmail)
      : "";
    return cancelReservationWithDeposit(
      reservation,
      manageToken,
      {
        bookingNotifier: fastify.bookingNotifier,
        logger,
      },
      { ...options, initiator: isAdmin ? "staff" : "guest" }
    );
  }

  // List reservations
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      date?: string;
      status?: ReservationStatus;
      tableId?: string;
      venueId?: string;
      guestId?: string;
    };
    Reply: PaginatedResponse<Reservation>;
  }>(
    "/",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveReservationsListVenueId),
      ],
      schema: {
        summary: "List reservations",
        operationId: "listReservations",
        description:
          "Retrieve a paginated list of reservations. Can filter by date, status, table, or venue.",
        tags: ["Reservations"],
        querystring: listReservationsQueryJsonSchema,
        response: {
          200: {
            description: "Successful response with paginated reservation list",
            ...createListResponseSchema("Reservation#"),
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, _reply) => {
      const { page, limit } = parsePaginationQuery(request.query);
      return reservationService.list({
        page,
        limit,
        date: request.query.date,
        status: request.query.status,
        tableId: request.query.tableId,
        venueId: request.query.venueId,
        guestId: request.query.guestId,
      });
    }
  );

  // Get current user's reservations (must come before /:id)
  fastify.get<{
    Querystring: { page?: string; limit?: string };
    Reply: PaginatedResponse<Reservation> | ProblemDetails;
  }>(
    "/me",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get current user's reservations",
        operationId: "getMyReservations",
        description: "Retrieve reservations for the currently authenticated user.",
        tags: ["Reservations"],
        security: [{ bearerAuth: [] }],
        querystring: listMyReservationsQueryJsonSchema,
        response: {
          200: {
            description: "User's reservations",
            ...createListResponseSchema("Reservation#"),
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const authUser = request.user;
      if (!authUser) {
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Authentication required"));
      }

      const { page, limit } = parsePaginationQuery(request.query);
      return reservationService.listByUserId(authUser.id, page, limit);
    }
  );

  // Create walk-in reservation (must be before /:id)
  fastify.post<{
    Body: WalkInRequest;
    Reply: ApiResponse<Reservation> | ProblemDetails;
  }>(
    "/walk-in",
    {
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, venueIdFromBody)],
      schema: {
        summary: "Create a walk-in reservation",
        operationId: "createWalkIn",
        description:
          "Create an immediate walk-in reservation. Sets the reservation to CONFIRMED status and marks the table as OCCUPIED. Requires authentication.",
        tags: ["Reservations"],
        security: [{ bearerAuth: [] }],
        body: walkInBodyJsonSchema,
        response: {
          201: {
            description: "Walk-in reservation created successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          409: {
            description: "Table is not available",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user?.id;
      // createWalkIn inserts the reservation AND flips the table to OCCUPIED in
      // a single transaction. If the table update fails the whole thing rolls
      // back and rejects, so we only reach the SSE emits below after a
      // committed, consistent state.
      const result = await reservationService.createWalkIn(request.body, userId);
      if (!result.success || !result.reservation) {
        return reply
          .code(409)
          .send(createProblemDetails(409, "Conflict", result.error ?? "Table is not available"));
      }
      // Emit only after the transaction has committed.
      fastify.reservationEvents.emitReservationCreated(result.reservation);
      if (result.table) {
        fastify.reservationEvents.emitTableUpdated(result.table);
      }
      return reply.code(201).send({ data: result.reservation });
    }
  );

  // Get reservation by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Reservation> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: [requireAuth, requireReservationOwnerOrAdmin],
      schema: {
        summary: "Get reservation by ID",
        operationId: "getReservationById",
        description: "Retrieve a single reservation by its unique identifier.",
        tags: ["Reservations"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique reservation identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Reservation found",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          404: {
            description: "Reservation not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const reservation = await reservationService.getById(request.params.id);
      if (!reservation) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Reservation not found"));
      }

      return { data: reservation };
    }
  );

  // Create reservation
  fastify.post<{
    Body: CreateReservationRequest;
    Reply: ApiResponse<Reservation> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: optionalAuth,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        summary: "Create a new reservation",
        operationId: "createReservation",
        description:
          "Create a new reservation. Authentication is optional - guest info can be provided instead.",
        tags: ["Reservations"],
        body: createReservationBodyJsonSchema,
        response: {
          201: {
            description: "Reservation created successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          400: {
            description: "Invalid request body or pacing limit exceeded",
            $ref: "Error#",
          },
          409: {
            description: "Conflict with existing reservation or hold",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user?.id;

      const useEnhancedValidation = request.features.check("enhanced-validation");

      if (useEnhancedValidation && request.body.partySize > 20) {
        return reply
          .code(400)
          .send(
            createProblemDetails(
              400,
              "Bad Request",
              "Party size exceeds limit for enhanced validation"
            )
          );
      }

      const result = await reservationService.createWithConflictCheck(request.body, userId);

      if (!result.success) {
        const statusCode = result.conflict?.hasConflict ? 409 : 400;
        const title = statusCode === 409 ? "Conflict" : "Bad Request";
        return reply
          .code(statusCode)
          .send(
            createProblemDetails(statusCode, title, result.error ?? "Failed to create reservation")
          );
      }

      return reply.code(201).send({ data: result.reservation! });
    }
  );

  // Update reservation
  fastify.patch<{
    Params: { id: string };
    Body: UpdateReservationRequest;
    Reply: ApiResponse<Reservation> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: [requireAuth, requireReservationOwnerOrAdmin],
      schema: {
        summary: "Update a reservation",
        operationId: "updateReservation",
        description: "Update an existing reservation. Only provided fields will be updated.",
        tags: ["Reservations"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique reservation identifier",
            },
          },
          required: ["id"],
        },
        body: updateReservationBodyJsonSchema,
        response: {
          200: {
            description: "Reservation updated successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          400: {
            description: "Invalid request",
            $ref: "Error#",
          },
          404: {
            description: "Reservation not found",
            $ref: "Error#",
          },
          409: {
            description: "Conflict with existing reservation or hold",
            // allOf the shared Error# schema (RFC 7807 fields: type, title,
            // status, detail, instance) plus the machine-readable `code`
            // extension (e.g. PARTY_SIZE_DEPOSIT_HELD, #2998) that isn't
            // present on Error#. A bare inline schema here would make
            // fast-json-stringify strip the RFC 7807 fields from every 409
            // this route sends, not just the deposit-guard one (#3017 review).
            allOf: [
              { $ref: "Error#" },
              {
                type: "object",
                properties: {
                  code: { type: "string" },
                },
              },
            ],
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const reservation = await reservationService.getById(request.params.id);
      if (!reservation) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Reservation not found"));
      }

      if (request.body.status === "CANCELLED") {
        try {
          const result = await cancelReservationForRequest(
            reservation,
            request.log,
            request.authorization?.isAdmin === true,
            {
              cancellationReason: request.body.cancellationReason,
              cancellationNote: request.body.cancellationNote,
            }
          );

          if (!result.success) {
            return reply
              .code(result.status)
              .send(createProblemDetails(result.status, result.title, result.detail));
          }

          fastify.reservationEvents.emitReservationCancelled(result.reservation);
          return { data: result.reservation };
        } catch (err) {
          if (err instanceof ReservationTransitionError) {
            return reply.code(409).send(createProblemDetails(409, "Conflict", err.message));
          }
          throw err;
        }
      }

      if (request.body.status === "NO_SHOW") {
        try {
          const result = await recordNoShow(reservation, request.log);

          if (!result.success) {
            return reply
              .code(result.status)
              .send(createProblemDetails(result.status, result.title, result.detail));
          }

          return { data: result.reservation };
        } catch (err) {
          if (err instanceof ReservationTransitionError) {
            return reply.code(409).send(createProblemDetails(409, "Conflict", err.message));
          }
          throw err;
        }
      }

      // #2998: staff PATCH accepts partySize but previously bypassed the
      // per_person-deposit guard added for the public manage route in
      // #2997/#2931 (decision: Block) — route through the same check here
      // so a staff caller can't silently diverge a held/pending deposit
      // either. Staff who need to override should capture/refund the
      // deposit first, or cancel and rebook.
      if (
        request.body.partySize !== undefined &&
        (await isPartySizeDepositBlocked(reservation, request.body.partySize))
      ) {
        return reply
          .code(409)
          .send(
            createProblemDetails(
              409,
              "Conflict",
              "This venue charges a per-person deposit and a payment is already pending or " +
                "held for this reservation. Capture or refund the deposit before changing party " +
                "size, or cancel this reservation and rebook to get a correctly re-priced hold.",
              "about:blank",
              undefined,
              { code: "PARTY_SIZE_DEPOSIT_HELD" }
            )
          );
      }

      try {
        const result = await reservationService.updateWithConflictCheck(
          request.params.id,
          request.body
        );

        if (!result.success) {
          if (result.error === "Reservation not found") {
            return reply
              .code(404)
              .send(createProblemDetails(404, "Not Found", "Reservation not found"));
          }

          if (result.conflict?.hasConflict) {
            return reply
              .code(409)
              .send(
                createProblemDetails(409, "Conflict", result.error ?? "Time slot has a conflict")
              );
          }

          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                result.error ?? "Failed to update reservation"
              )
            );
        }

        // Fire post-visit thank-you email when status transitions to COMPLETED
        if (request.body.status === "COMPLETED" && result.reservation) {
          const reservation = result.reservation;
          const venue = reservation.venueId
            ? await venueService.getById(reservation.venueId)
            : null;
          const settings = (venue?.settings ?? {}) as Record<string, unknown>;
          const postVisitEmailEnabled = Boolean(settings.postVisitEmailEnabled);

          fastify.postVisitNotifier
            .sendPostVisitEmail({
              reservationId: reservation.id,
              guestId: reservation.guestId ?? null,
              guestEmail: reservation.guestEmail ?? null,
              guestFirstName: reservation.guestName?.split(" ")[0] ?? null,
              unsubscribed: Boolean(reservation.guest?.unsubscribed),
              venueName: venue?.name ?? "",
              venuePostVisitEmailEnabled: postVisitEmailEnabled,
              visitDate: reservation.date,
              feedbackUrl: (settings.feedbackUrl as string | null) ?? null,
            })
            .catch((err) =>
              fastify.log.error({ err }, "Failed to send post-visit thank-you email")
            );
        }

        return { data: result.reservation! };
      } catch (err) {
        if (err instanceof ReservationTransitionError) {
          return reply.code(409).send(createProblemDetails(409, "Conflict", err.message));
        }
        throw err;
      }
    }
  );

  // Cancel reservation (DELETE)
  fastify.delete<{
    Params: { id: string };
    Reply: ApiResponse<Reservation> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: [requireAuth, requireReservationOwnerOrAdmin],
      schema: {
        summary: "Cancel a reservation",
        operationId: "cancelReservation",
        description:
          "Cancel a reservation. The reservation is marked as cancelled but not deleted.",
        tags: ["Reservations"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique reservation identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Reservation cancelled successfully",
            type: "object",
            properties: {
              data: { $ref: "Reservation#" },
            },
          },
          404: {
            description: "Reservation not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const reservation = await reservationService.getById(request.params.id);
      if (!reservation) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Reservation not found"));
      }

      try {
        const result = await cancelReservationForRequest(
          reservation,
          request.log,
          request.authorization?.isAdmin === true
        );
        if (!result.success) {
          return reply
            .code(result.status)
            .send(createProblemDetails(result.status, result.title, result.detail));
        }
        return { data: result.reservation };
      } catch (err) {
        if (err instanceof ReservationTransitionError) {
          return reply.code(409).send(createProblemDetails(409, "Conflict", err.message));
        }
        throw err;
      }
    }
  );
};
