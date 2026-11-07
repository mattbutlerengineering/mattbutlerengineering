import { addDays, validateConfig, type ConfigIssue } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { toDbDate } from "./availability-config.js";
import { rekey, type CarriedOutcomes } from "./closure-carry-outcomes.js";

/**
 * Reopening one date of a range closure (#7984). The range is removed, as a reopen removes any
 * rule, and the dates either side of the reopened one are saved as new rules beside it. What the
 * range did to its guests follows their date: each guest's outcome moves to the part that covers
 * their booking, and the reopened date's outcomes stay on the removed range, so a reopen notice
 * for that rule reaches exactly the guests on the reopened date and no one else.
 */

export type RangeParts =
  { kind: "parts"; parts: DateRule[] } | { kind: "invalid"; message: string };

const invalid = (message: string): RangeParts => ({ kind: "invalid", message });

/**
 * The rules that keep a range's other dates closed once `date` is open: none for a one-date rule,
 * one for an edge date, two for a date in the middle. Only a bounded, non-repeating range has dates
 * to give back one at a time; a series skips a date instead.
 */
export function rangeAround(rule: DateRule, date: string, newId: () => string): RangeParts {
  if (rule.repeat != null) return invalid("A repeating closure skips a date instead.");
  if (rule.endsOn == null) return invalid("An open-ended closure has no last date to split at.");
  // The date schema is a pattern only: "2027-02-31" matches it, and Date rolls it into March.
  if (addDays(date, 0) !== date) return invalid("That date is not on the calendar.");
  if (date < rule.startsOn || date > rule.endsOn) {
    return invalid("That date is not one of the closure's dates.");
  }
  const parts: DateRule[] = [];
  if (date > rule.startsOn) {
    parts.push({ ...rule, id: newId(), endsOn: addDays(date, -1) });
  }
  if (date < rule.endsOn) {
    parts.push({ ...rule, id: newId(), startsOn: addDays(date, 1) });
  }
  return { kind: "parts", parts };
}

/**
 * What `validateConfig` finds wrong with the rules this split created, and only those. A reopen
 * must work in an emergency on a venue that already holds some unrelated invalid rule, so the
 * whole config's issues are not its business.
 */
export function splitIssues(next: AvailabilityConfig, created: readonly DateRule[]): ConfigIssue[] {
  const indexes = new Set(
    created.map((c) => next.dateRules.findIndex((r) => r.id === c.id)).filter((i) => i >= 0)
  );
  return validateConfig(next).filter((issue) => {
    const at = /^dateRules\[(\d+)\]/.exec(issue.path);
    return at !== null && indexes.has(Number(at[1]));
  });
}

type Db = Pick<PrismaClient, "closureOutcome" | "$executeRaw">;

/**
 * Moves the outcomes of `from` onto the part that covers each booking's service date. Returns what
 * moved (for Undo to return), or `null` when nothing did. One outcome per booking and rule stays
 * true: a booking's date is in exactly one part, so no outcome is moved twice or copied.
 */
export async function carryByDate(
  tx: Db,
  venueId: string,
  from: string,
  parts: readonly DateRule[],
  /** Bookings the same save gives a new outcome of their own: one outcome per booking and rule. */
  deciding: readonly string[] = []
): Promise<CarriedOutcomes | null> {
  const moved: string[] = [];
  for (const part of parts) {
    const rows = await tx.closureOutcome.findMany({
      where: {
        venueId,
        dateRuleId: from,
        ...(deciding.length > 0 ? { reservationId: { notIn: [...deciding] } } : {}),
        reservation: {
          // An open-ended part has no last date: every booking from its start on is its.
          date: {
            gte: toDbDate(part.startsOn)!,
            ...(part.endsOn != null ? { lte: toDbDate(part.endsOn)! } : {}),
          },
        },
      },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) await rekey(tx, ids, part.id);
    moved.push(...ids);
  }
  return moved.length > 0 ? { from, outcomeIds: moved } : null;
}
