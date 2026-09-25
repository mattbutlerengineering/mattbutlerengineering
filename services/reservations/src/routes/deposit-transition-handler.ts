import type { FastifyReply, FastifyRequest } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { depositService, DepositTransitionError } from "../services/deposit.js";
import { loadInVenueContext } from "./venue-access.js";
import type { Deposit } from "../generated/prisma/index.js";

type DepositTransitionRequest = FastifyRequest<{ Params: { id: string } }>;

/**
 * Factory for the capture/refund/forfeit route handlers, which all share the
 * same resolve venue → load → 404-if-missing → try transition →
 * 422-on-DepositTransitionError shape. `transition` is the deposit-service
 * call specific to the route (apply, refund, forfeit).
 *
 * Venue scoping (ADR-026, issue #5382 / #5369 PR 7): these routes are
 * addressed only by an opaque deposit id, so the app-wide venue-context
 * preHandler resolves nothing for them. The venue is resolved through the
 * `SECURITY DEFINER` `app_resolve_venue_id('deposit', id)` (`loadInVenueContext`,
 * `./venue-access.ts`) — a join to the deposit's own reservation performed
 * inside the resolver's own definer body, not a prior unscoped Prisma read —
 * and both the deposit load and the transition then run inside that context,
 * so every statement the state machine issues — the compare-and-swap write
 * included — is covered by the `deposit_isolation` policy instead of running
 * venue-less (ADR-026 §4 default-deny, i.e. silently invisible under
 * `FORCE ROW LEVEL SECURITY`).
 *
 * An unresolvable venue (deposit or its reservation deleted, or
 * `venue_id IS NULL`) FAILS CLOSED with the same 404 a missing deposit gets:
 * the deposit is not addressable within any venue scope, and this is a
 * payment surface — the refusal happens before the state machine runs, so no
 * DB write and no Stripe call can have happened. `transition` itself is
 * untouched; its ordering and idempotency keys are entirely the deposit
 * service's, unchanged.
 */
/** Discriminated outcome of the venue-scoped load + transition below — see
 * `loadInVenueContext`'s `fallback` parameter: it is a plain value evaluated
 * by the CALLER before the venue even resolves, so the 404/422 replies below
 * cannot be sent from inside `fallback` itself (that would fire on every
 * call, not just an unresolvable venue). A result value is threaded out and
 * turned into the actual reply after `loadInVenueContext` returns instead —
 * the same shape `floor-plans.ts`'s `/tables/positions` route uses. */
type TransitionResult =
  { kind: "not-found" } | { kind: "invalid"; message: string } | { kind: "ok"; deposit: Deposit };

export function depositTransitionHandler(transition: (id: string) => Promise<Deposit>) {
  return async (request: DepositTransitionRequest, reply: FastifyReply) => {
    const result = await loadInVenueContext<TransitionResult>(
      "deposit",
      request.params.id,
      async () => {
        const existing = await depositService.getById(request.params.id);
        if (!existing) {
          return { kind: "not-found" };
        }

        try {
          const deposit = await transition(request.params.id);
          return { kind: "ok", deposit };
        } catch (err) {
          if (err instanceof DepositTransitionError) {
            return { kind: "invalid", message: err.message };
          }
          throw err;
        }
      },
      { kind: "not-found" }
    );

    if (result.kind === "not-found") {
      return reply.code(404).send(createProblemDetails(404, "Not Found", "Deposit not found"));
    }
    if (result.kind === "invalid") {
      return reply
        .code(422)
        .send(createProblemDetails(422, "Unprocessable Entity", result.message));
    }
    return { data: result.deposit };
  };
}
