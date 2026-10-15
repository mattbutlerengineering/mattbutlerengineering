import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth, requireAdmin } from "@mbe/auth/fastify";
import { createProblemDetails, createDepositBodyJsonSchema } from "@mbe/types";
import { DepositNotFoundError } from "../services/deposit.js";
import { resolveReservationVenueId } from "../services/deposit-venue.js";
import { venueScoped } from "./venue-scope.js";
import { depositTransitionHandler } from "./deposit-transition-handler.js";
import type { Deposit } from "../generated/prisma/index.js";

interface ApiResponse<T> {
  data: T;
}

type DepositsQuery = { reservationId?: string; venueId?: string; date?: string };

/**
 * `GET /deposits` answers one of two selectors: `reservationId`, or `venueId`
 * with `date`. Anything else is a 400 before any venue is resolved, so the
 * route's `venueScoped` source only ever sees a usable selector.
 */
async function requireDepositSelector(
  request: FastifyRequest<{ Querystring: DepositsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const { reservationId, venueId, date } = request.query;
  if (reservationId || (venueId && date)) return;
  reply
    .code(400)
    .send(
      createProblemDetails(400, "Bad Request", "reservationId, or venueId and date, is required")
    );
}

const depositProperties = {
  id: { type: "string" },
  reservationId: { type: "string" },
  amountCents: { type: "integer" },
  currency: { type: "string" },
  status: {
    type: "string",
    enum: [
      "pending",
      "held",
      "applied",
      "refunded",
      "partial_refunded",
      "forfeited",
      "uncollectable",
    ],
  },
  stripePaymentIntentId: { type: ["string", "null"] },
  stripeCustomerId: { type: ["string", "null"] },
  heldAt: { type: ["string", "null"] },
  appliedAt: { type: ["string", "null"] },
  refundedAt: { type: ["string", "null"] },
  forfeitedAt: { type: ["string", "null"] },
  uncollectableAt: { type: ["string", "null"] },
  postCaptureRefundCents: { type: ["integer", "null"] },
  createdAt: { type: "string" },
  updatedAt: { type: "string" },
};

/**
 * Admin deposit routes.
 *
 * Venue scoping (ADR-026, issue #5382): `requireAdmin` is a stateless,
 * platform-wide role check, and every route here is addressed by an opaque
 * deposit/reservation id — no `venueId` in the query, body, or params — so the
 * app-wide venue-context preHandler (`../app.ts`) resolves nothing for them and
 * `app.venue_id` was left unset. Under the `deposit_isolation` policy that is
 * default-deny (ADR-026 §4): every deposit would become silently invisible to
 * staff once `FORCE ROW LEVEL SECURITY` lands. Each route therefore resolves
 * the venue through the deposit's own reservation and declares it with
 * `venueScoped` (`./venue-scope.ts`), which runs the deposit work inside that
 * context. This ADDS venue resolution; it does not replace `requireAdmin`,
 * which still gates all six routes.
 *
 * An unresolvable venue — reservation deleted, or `Reservation.venueId` NULL —
 * fails closed with a 404 rather than proceeding venue-less. The deposit is
 * not addressable within any venue scope, which is also what the policy itself
 * would conclude (ADR-026 §2/§5), and ADR-020 already treats an unresolvable
 * venue as a refusal.
 *
 * Closed (ADR-026 §3.3 item 6 / #5369 PR 7): the lookup that determines the
 * scope used to be an unscoped read of the addressed deposit (or the
 * reservation `resolveReservationVenueId` loaded), which is itself one of the
 * seven RLS-scoped tables — the same "lookup can't run inside the scope it's
 * computing" shape as the old `venueIdFromEntity` resolver (deleted), and measured
 * broken under FORCE (ADR-026 §3.2's blockquote). Every route now resolves
 * through the `SECURITY DEFINER` `app_resolve_venue_id` function instead
 * (`resolveVenueId`, `../services/resolve-venue.ts`, called by `venueScoped`
 * or by `resolveReservationVenueId`), which performs the reservation join
 * inside its own definer body rather than as a separate unscoped Prisma read.
 */
export const depositRoutes: FastifyPluginAsync = async (fastify) => {
  const { depositService } = fastify.services;

  // POST /api/v1/deposits — create a deposit
  fastify.post<{
    Body: { reservationId: string; amountCents: number; currency?: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Create a deposit",
        operationId: "createDeposit",
        description: "Create a new deposit in pending state for a reservation.",
        tags: ["Deposits"],
        body: createDepositBodyJsonSchema,
        response: {
          201: {
            description: "Deposit created",
            type: "object",
            properties: {
              data: { type: "object", properties: depositProperties },
            },
          },
          400: { description: "Bad request", type: "object" },
          404: { description: "Reservation not found, or not in any venue", type: "object" },
        },
      },
    },
    venueScoped(
      {
        venue: {
          entity: "reservation",
          key: (request: { body: { reservationId: string } }) => request.body.reservationId,
          notFound: "Reservation not found",
        },
      },
      async (request, reply) => {
        const deposit = await depositService.create({
          reservationId: request.body.reservationId,
          amountCents: request.body.amountCents,
          currency: request.body.currency,
        });
        return reply.code(201).send({ data: deposit });
      }
    )
  );

  // GET /api/v1/deposits?reservationId= — operator visibility: look up a
  // reservation's deposit (or null if none exists yet), venue-scoped. Same
  // venue-resolution shape as POST / above: the query carries an opaque
  // reservation id, not a venueId, so the app-wide preHandler resolves
  // nothing and this route resolves it itself (module comment, ADR-026).
  //
  // GET /api/v1/deposits?venueId=&date= — deposit-exposure dashboard batch
  // read (#5832): every deposit for a venue's reservations on a given date.
  // Here the venue is the query's own `venueId`. Either way the route
  // declares its scope with `venueScoped`, so it is never implicit.
  fastify.get<{
    Querystring: DepositsQuery;
    Reply: ApiResponse<Deposit | Deposit[] | null> | ReturnType<typeof createProblemDetails>;
  }>(
    "/",
    {
      preHandler: [requireAuth, requireAdmin, requireDepositSelector],
      schema: {
        summary: "Get a reservation's deposit, or list a venue's deposits for a date",
        operationId: "getDeposits",
        description:
          "Look up a reservation's deposit by reservationId (or null if none exists yet), " +
          "or list every deposit for a venue's reservations on a given date (venueId + date).",
        tags: ["Deposits"],
        querystring: {
          type: "object",
          properties: {
            reservationId: { type: "string" },
            venueId: { type: "string" },
            date: { type: "string" },
          },
        },
        response: {
          200: {
            description: "Deposit found (or null), or the venue's deposits for the date",
            type: "object",
            properties: {
              data: {
                anyOf: [
                  { type: "object", properties: depositProperties },
                  { type: "array", items: { type: "object", properties: depositProperties } },
                  { type: "null" },
                ],
              },
            },
          },
          400: {
            description: "Missing reservationId, or missing venueId/date",
            type: "object",
          },
          404: { description: "Reservation not found, or not in any venue", type: "object" },
        },
      },
    },
    venueScoped(
      {
        venue: {
          // requireDepositSelector guarantees `venueId` when there is no
          // `reservationId`; only an unresolvable reservation yields null.
          resolve: async ({ query }) =>
            query.reservationId ? resolveReservationVenueId(query.reservationId) : query.venueId!,
          label: "reservationId|venueId",
          notFound: "Reservation not found",
        },
      },
      async (request, _reply, { venueId }) => {
        const { reservationId, date } = request.query;
        if (reservationId) {
          return { data: await depositService.getByReservationId(reservationId) };
        }
        return { data: await depositService.listByVenueAndDate(venueId, new Date(date!)) };
      }
    )
  );

  // GET /api/v1/deposits/:id — get deposit by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:id",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Get deposit by ID",
        operationId: "getDepositById",
        description: "Retrieve a deposit by its unique identifier.",
        tags: ["Deposits"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Deposit found",
            type: "object",
            properties: {
              data: { type: "object", properties: depositProperties },
            },
          },
          404: { description: "Not found", type: "object" },
        },
      },
    },
    // ADR-026 §3.3 item 6 / #5369 PR 7: the venue resolves straight through
    // the `SECURITY DEFINER` `app_resolve_venue_id('deposit', id)` — a join to
    // the deposit's own reservation done INSIDE the resolver, not via a prior
    // unscoped `depositService.getById` — so the load already runs inside the
    // resolved venue context.
    venueScoped(
      {
        venue: {
          entity: "deposit",
          key: (request: { params: { id: string } }) => request.params.id,
          load: (id: string) => depositService.getById(id),
          notFound: "Deposit not found",
        },
      },
      async (_request, _reply, { entity: deposit }) => ({ data: deposit })
    )
  );

  // POST /api/v1/deposits/:id/capture — apply (capture) a held deposit
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:id/capture",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Capture (apply) a deposit",
        operationId: "captureDeposit",
        description:
          "Capture a held deposit — transitions state from held → applied and charges the card.",
        tags: ["Deposits"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Deposit applied",
            type: "object",
            properties: {
              data: { type: "object", properties: depositProperties },
            },
          },
          404: { description: "Not found", type: "object" },
          422: { description: "Invalid state transition", type: "object" },
        },
      },
    },
    depositTransitionHandler(depositService, (id) => depositService.apply(id))
  );

  // POST /api/v1/deposits/:id/refund — refund a held deposit
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:id/refund",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Refund a deposit",
        operationId: "refundDeposit",
        description:
          "Refund a held deposit — transitions state from held → refunded and releases the authorization.",
        tags: ["Deposits"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Deposit refunded",
            type: "object",
            properties: {
              data: { type: "object", properties: depositProperties },
            },
          },
          404: { description: "Not found", type: "object" },
          422: { description: "Invalid state transition", type: "object" },
        },
      },
    },
    depositTransitionHandler(depositService, (id) => depositService.refund(id))
  );

  // POST /api/v1/deposits/:id/forfeit — forfeit a held deposit
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:id/forfeit",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "Forfeit a deposit",
        operationId: "forfeitDeposit",
        description:
          "Forfeit a held deposit (no-show) — transitions state from held → forfeited and charges the card.",
        tags: ["Deposits"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Deposit forfeited",
            type: "object",
            properties: {
              data: { type: "object", properties: depositProperties },
            },
          },
          404: { description: "Not found", type: "object" },
          422: { description: "Invalid state transition", type: "object" },
        },
      },
    },
    depositTransitionHandler(depositService, (id) => depositService.forfeit(id, "staff"))
  );
};

// Export error class for use in other places
export { DepositNotFoundError };
