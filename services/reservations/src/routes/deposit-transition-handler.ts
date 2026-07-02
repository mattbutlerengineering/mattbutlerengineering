import type { FastifyReply, FastifyRequest } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { depositService, DepositTransitionError } from "../services/deposit.js";
import type { Deposit } from "../generated/prisma/index.js";

type DepositTransitionRequest = FastifyRequest<{ Params: { id: string } }>;

/**
 * Factory for the capture/refund/forfeit route handlers, which all share the
 * same load → 404-if-missing → try transition → 422-on-DepositTransitionError
 * shape. `transition` is the deposit-service call specific to the route
 * (apply, refund, forfeit).
 */
export function depositTransitionHandler(transition: (id: string) => Promise<Deposit>) {
  return async (request: DepositTransitionRequest, reply: FastifyReply) => {
    const existing = await depositService.getById(request.params.id);
    if (!existing) {
      return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
    }

    try {
      const deposit = await transition(request.params.id);
      return { data: deposit };
    } catch (err) {
      if (err instanceof DepositTransitionError) {
        return reply.code(422).send(createProblemDetails(422, "Unprocessable Entity", err.message));
      }
      throw err;
    }
  };
}
