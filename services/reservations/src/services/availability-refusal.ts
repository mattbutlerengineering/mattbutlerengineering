import type { ConfigIssue } from "@mbe/availability";
import type {
  AvailabilityChangeSummary,
  ConflictChangesSince,
  StrandedReservation,
} from "@mbe/types";
import { setVenueContext } from "../middleware/venue-context.js";
import type { ReferenceIssue } from "./availability-config-plan.js";
import type { StoreClient, StoreDb } from "./availability-config.js";
import type { RefusalIssue } from "./closure-command.js";

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
 * transaction's boundary answers it as the outcome. `O` is `AvailabilityRefusal` unless the
 * caller has refusals of its own (a revert's).
 */
export class Refused<O extends { kind: string } = AvailabilityRefusal> extends Error {
  constructor(readonly outcome: O) {
    super(outcome.kind);
  }
}

/** Refuses the command in progress; only valid inside `inAvailabilityTransaction` or a command's own boundary. */
export function refuse(outcome: { kind: string }): never {
  throw new Refused(outcome);
}

/**
 * Runs `work` as one venue-scoped transaction in which a command may be refused:
 * a refusal rolls the whole transaction back and comes back as the outcome. `T` is the work's
 * own result (its outcome type already names the refusals it can produce); `R` adds refusals the
 * work can only throw.
 */
export async function inAvailabilityTransaction<T, R extends { kind: string } = never>(
  client: StoreClient,
  venueId: string,
  work: (tx: StoreDb) => Promise<T>
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
