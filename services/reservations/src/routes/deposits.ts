import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
import {
  depositService,
  DepositTransitionError,
  DepositNotFoundError,
} from "../services/deposit.js";
import type { Deposit } from "../generated/prisma/index.js";

interface ApiResponse<T> {
  data: T;
}

const depositProperties = {
  id: { type: "string" },
  reservationId: { type: "string" },
  amountCents: { type: "integer" },
  currency: { type: "string" },
  status: { type: "string", enum: ["pending", "held", "applied", "refunded", "forfeited"] },
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
      preHandler: requireAuth,
      schema: {
        summary: "Create a deposit",
        operationId: "createDeposit",
        description: "Create a new deposit in pending state for a reservation.",
        tags: ["Deposits"],
        body: {
          type: "object",
          required: ["reservationId", "amountCents"],
          properties: {
            reservationId: { type: "string", description: "ID of the reservation" },
            amountCents: { type: "integer", minimum: 1, description: "Deposit amount in cents" },
            currency: { type: "string", default: "usd", description: "ISO currency code" },
          },
        },
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
      preHandler: requireAuth,
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
      preHandler: requireAuth,
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
    async (request, reply) => {
      const existing = await depositService.getById(request.params.id);
      if (!existing) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
      }

      try {
        const deposit = await depositService.apply(request.params.id);
        return { data: deposit };
      } catch (err) {
        if (err instanceof DepositTransitionError) {
          return reply
            .code(422)
            .send(createProblemDetails(422, "Unprocessable Entity", err.message));
        }
        throw err;
      }
    }
  );

  // POST /api/v1/deposits/:id/refund — refund a held deposit
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:id/refund",
    {
      preHandler: requireAuth,
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
    async (request, reply) => {
      const existing = await depositService.getById(request.params.id);
      if (!existing) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
      }

      try {
        const deposit = await depositService.refund(request.params.id);
        return { data: deposit };
      } catch (err) {
        if (err instanceof DepositTransitionError) {
          return reply
            .code(422)
            .send(createProblemDetails(422, "Unprocessable Entity", err.message));
        }
        throw err;
      }
    }
  );

  // POST /api/v1/deposits/:id/forfeit — forfeit a held deposit
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<Deposit> | ReturnType<typeof createProblemDetails>;
  }>(
    "/:id/forfeit",
    {
      preHandler: requireAuth,
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
    async (request, reply) => {
      const existing = await depositService.getById(request.params.id);
      if (!existing) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
      }

      try {
        const deposit = await depositService.forfeit(request.params.id);
        return { data: deposit };
      } catch (err) {
        if (err instanceof DepositTransitionError) {
          return reply
            .code(422)
            .send(createProblemDetails(422, "Unprocessable Entity", err.message));
        }
        throw err;
      }
    }
  );
};

// Export error class for use in other places
export { DepositNotFoundError };
