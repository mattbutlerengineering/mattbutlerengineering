import type { ConfigIssue } from "@mbe/availability";
import type {
  AvailabilityChangeSummary,
  ConflictChangesSince,
  StrandedReservation,
} from "@mbe/types";
import { setVenueContext } from "../middleware/venue-context.js";
import type { ReferenceIssue } from "./availability-config-plan.js";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";

export interface RefusalIssue {
  path: string;
  code: string;
  message: string;
  reservation?: StrandedReservation;
}

/**
 * Every way an availability command (save, revert, closure, Tonight) can refuse. A command's
 * outcome is `{ saved... } | Extract<AvailabilityRefusal, { kind: ... }>` for the kinds it can
 * produce, so a refusal built in one place is valid in all of them.
 */
export type AvailabilityRefusal =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "too_long" }
  | {
      kind: "version_conflict";
      winningChange: AvailabilityChangeSummary | null;
      /** The version read before `winningChange`, so a later save can only make the winner newer. */
      currentVersion: number;
      /** Every change since the draft's version: the newest few and the true count. */
      changesSince?: ConflictChangesSince;
    }
  | { kind: "key_reused" }
  | { kind: "closure_exists" }
  | { kind: "invalid"; issues: (ConfigIssue | ReferenceIssue | RefusalIssue)[] }
  | { kind: "stranded"; reservations: StrandedReservation[] }
  | { kind: "decision_required"; groupKeys: string[] }
  | { kind: "invalid_decision"; groupKeys: string[] }
  | { kind: "move_unavailable"; reservationIds: string[] };

/**
 * Thrown inside an availability transaction to roll it back (the version bump included); the
 * transaction's boundary answers it as the outcome. Only `refuse` (a revert's own refusals) may
 * carry a kind outside `AvailabilityRefusal`.
 */
export class Refused extends Error {
  constructor(readonly outcome: AvailabilityRefusal) {
    super(outcome.kind);
  }
}

/** Refuses the command in progress; only valid inside `inAvailabilityTransaction` or a command's own boundary. */
export function refuse(outcome: { kind: string }): never {
  // The wide parameter admits a caller's own refusals (a revert's); its `R` names them at the boundary.
  throw new Refused(outcome as AvailabilityRefusal);
}

/**
 * Runs `work` as one venue-scoped transaction in which a command may be refused:
 * a refusal rolls the whole transaction back and comes back as the outcome. `T` is the work's
 * own result (its outcome type already names the refusals it can produce); `R` adds refusals the
 * work can only throw.
 */
export async function inAvailabilityTransaction<T, R extends { kind: string } = never>(
  client: Pick<PrismaClient, "$transaction">,
  venueId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T | R> {
  try {
    return await client.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      return work(tx);
    });
  } catch (error) {
    // Invariant: only `refuse` and the commands' own `Refused` throw it, with an outcome the caller's T or R names.
    if (error instanceof Refused) return error.outcome as T | R;
    throw error;
  }
}
