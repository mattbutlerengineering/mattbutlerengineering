import { createProblemDetails } from "@mbe/types";
import {
  DepositConcurrentUpdateError,
  DepositTransitionError,
  type DepositService,
} from "../services/deposit.js";
import { venueScoped } from "./venue-scope.js";
import type { Deposit } from "../generated/prisma/index.js";

/**
 * Factory for the capture/refund/forfeit route handlers, which all share the
 * same resolve venue → load → 404-if-missing → try transition →
 * 422-on-DepositTransitionError shape. `transition` is the deposit-service
 * call specific to the route (apply, refund, forfeit).
 *
 * Venue scoping (ADR-026, issue #5382 / #5369 PR 7): these routes are
 * addressed only by an opaque deposit id. `venueScoped` resolves the venue
 * through the `SECURITY DEFINER` `app_resolve_venue_id('deposit', id)` — a
 * join to the deposit's own reservation performed inside the resolver's own
 * definer body, not a prior unscoped Prisma read — and both the deposit load
 * and the transition then run inside that context, so every statement the
 * state machine issues — the compare-and-swap write included — is covered by
 * the `deposit_isolation` policy instead of running venue-less (ADR-026 §4
 * default-deny, i.e. silently invisible under `FORCE ROW LEVEL SECURITY`).
 *
 * An unresolvable venue (deposit or its reservation deleted, or
 * `venue_id IS NULL`) FAILS CLOSED with the same 404 a missing deposit gets:
 * the deposit is not addressable within any venue scope, and this is a
 * payment surface — the refusal happens before the state machine runs, so no
 * DB write and no Stripe call can have happened. `transition` itself is
 * untouched; its ordering and idempotency keys are entirely the deposit
 * service's, unchanged.
 */
/** The capture/refund/forfeit routes' generic, shared with `./deposits.ts`. */
export interface DepositTransitionRoute {
  Params: { id: string };
  Reply: { data: Deposit } | ReturnType<typeof createProblemDetails>;
}

export function depositTransitionHandler(
  deposits: DepositService,
  transition: (id: string) => Promise<Deposit>
) {
  return venueScoped<DepositTransitionRoute, Deposit>(
    {
      venue: {
        entity: "deposit",
        key: (request) => request.params.id,
        load: (id) => deposits.getById(id),
        notFound: "Deposit not found",
      },
    },
    async (request, reply) => {
      try {
        return { data: await transition(request.params.id) };
      } catch (err) {
        if (err instanceof DepositTransitionError) {
          return reply
            .code(422)
            .send(createProblemDetails(422, "Unprocessable Entity", err.message));
        }
        if (err instanceof DepositConcurrentUpdateError) {
          return reply.code(409).send(createProblemDetails(409, "Conflict", err.message));
        }
        throw err;
      }
    }
  );
}
