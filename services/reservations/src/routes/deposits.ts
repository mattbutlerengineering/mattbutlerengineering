import type { FastifyPluginAsync } from "fastify";
import { requireAuth, requireAdmin } from "@mbe/auth/fastify";
import { createProblemDetails, createDepositBodyJsonSchema } from "@mbe/types";
import { depositService, DepositNotFoundError } from "../services/deposit.js";
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
    enum: ["pending", "held", "applied", "refunded", "partial_refunded", "forfeited"],
  },
  stripePaymentIntentId: { type: ["string", "null"] },
  stripeCustomerId: { type: ["string", "null"] },
  heldAt: { type: ["string", "null"] },
  appliedAt: { type: ["string", "null"] },
  refundedAt: { type: ["string", "null"] },
  forfeitedAt: { type: ["string", "null"] },
  createdAt: { type: "string" },
  updatedAt: { type: "string" },
};

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
        },
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
      const deposit = await depositService.getById(request.params.id);
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
