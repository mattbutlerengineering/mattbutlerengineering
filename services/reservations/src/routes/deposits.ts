import type { FastifyPluginAsync } from "fastify";
import { requireAuth, requireAdmin } from "@mbe/auth/fastify";
import { createProblemDetails, createDepositBodyJsonSchema } from "@mbe/types";
import { depositService, DepositNotFoundError } from "../services/deposit.js";
import { resolveReservationVenueId } from "../services/deposit-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import { depositTransitionHandler } from "./deposit-transition-handler.js";
import type { Deposit } from "../generated/prisma/index.js";

interface ApiResponse<T> {
  data: T;
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
 * the venue through the deposit's own reservation
 * (`resolveReservationVenueId`) and runs its deposit work inside that context.
 * This ADDS venue resolution; it does not replace `requireAdmin`, which still
 * gates all five routes.
 *
 * An unresolvable venue — reservation deleted, or `Reservation.venueId` NULL —
 * fails closed with a 404 rather than proceeding venue-less. The deposit is
 * not addressable within any venue scope, which is also what the policy itself
 * would conclude (ADR-026 §2/§5), and ADR-020 already treats an unresolvable
 * venue as a refusal.
 *
 * Residual, deliberately not solved here: the ONE lookup that determines the
 * scope (reading the addressed deposit, and its reservation's `venue_id`)
 * cannot itself run inside the scope it is computing. That is a property of
 * every entity-addressed route in this service — `venueIdFromEntity`
 * (`./venue-access.ts`) has the same shape — not something deposits can fix
 * alone; see ADR-026 §3.
 */
export const depositRoutes: FastifyPluginAsync = async (fastify) => {
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
    async (request, reply) => {
      const venueId = await resolveReservationVenueId(request.body.reservationId);
      if (!venueId) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Reservation not found"));
      }

      const deposit = await runWithVenueContext(venueId, () =>
        depositService.create({
          reservationId: request.body.reservationId,
          amountCents: request.body.amountCents,
          currency: request.body.currency,
        })
      );
      return reply.code(201).send({ data: deposit });
    }
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
    async (request, reply) => {
      // Scope-determining read (see the module comment): it cannot run inside
      // the scope it computes, and is used ONLY to reach the owning venue.
      const addressed = await depositService.getById(request.params.id);
      if (!addressed) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
      }

      const venueId = await resolveReservationVenueId(addressed.reservationId);
      if (!venueId) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
      }

      // The row actually returned is the one read under the resolved venue
      // context, so it is the row the `deposit_isolation` policy admits.
      const deposit = await runWithVenueContext(venueId, () =>
        depositService.getById(request.params.id)
      );
      if (!deposit) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
      }
      return { data: deposit };
    }
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
    depositTransitionHandler((id) => depositService.apply(id))
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
    depositTransitionHandler((id) => depositService.refund(id))
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
    depositTransitionHandler((id) => depositService.forfeit(id))
  );
};

// Export error class for use in other places
export { DepositNotFoundError };
