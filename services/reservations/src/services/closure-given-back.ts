import { addDays, stillClosedAfterReopen } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { toDbDate } from "./availability-config.js";

/**
 * Dates an edit of a closure gives back (ux.md F6 step 5, #8413). The edit saves the closure under
 * a new id and removes the old one; what the old closure did to a guest on a date the new one no
 * longer closes stays on the removed closure, where no reopen can reach it. So the edit asks about
 * those guests the way a reopen does, and the answer travels with the change: the guests told, and
 * where they sit, so the notice, History and Undo agree on who was told.
 */

type Db = Pick<PrismaClient, "closureOutcome">;

/** The guests an edit's reopen notice goes to, as stored on its audit row. */
export interface GivenBackGuests {
  /** The removed closure the outcomes sit on. */
  ruleId: string;
  outcomeIds: string[];
  /** The earliest date among them, which the notice's urgency is judged from. */
  from: string;
}

/**
 * The stretches of `replaced` that `next` does not close: before `next` starts, and after it ends.
 * Both are bounded or open-ended like the rule they were cut from. Neither overlaps the other.
 */
export function givenBackPieces(replaced: DateRule, next: DateRule): DateRule[] {
  const pieces: DateRule[] = [];
  if (replaced.startsOn < next.startsOn) {
    const last = addDays(next.startsOn, -1);
    const endsOn = replaced.endsOn != null && replaced.endsOn < last ? replaced.endsOn : last;
    pieces.push({ ...replaced, endsOn });
  }
  if (next.endsOn != null && (replaced.endsOn == null || replaced.endsOn > next.endsOn)) {
    const first = addDays(next.endsOn, 1);
    pieces.push({
      ...replaced,
      startsOn: replaced.startsOn > first ? replaced.startsOn : first,
    });
  }
  return pieces;
}

/**
 * The cancelled guests on the dates `next` gives back whose booking has not started: exactly whom a
 * reopen notice reaches. A stretch another closure still closes in full is left out, as a reopen
 * does (#8006): nobody is told to rebook a date that stays shut. `null` when there are none.
 */
export async function givenBackGuests(
  db: Db,
  input: {
    venueId: string;
    stored: readonly DateRule[];
    replaced: DateRule;
    next: DateRule;
    today: string;
    now: Date;
  }
): Promise<GivenBackGuests | null> {
  const { venueId, stored, replaced, next, today, now } = input;
  const found: { id: string; date: Date }[] = [];
  for (const piece of givenBackPieces(replaced, next)) {
    if (stillClosedAfterReopen(stored, piece, today).everyDate) continue;
    const rows = await db.closureOutcome.findMany({
      where: {
        venueId,
        dateRuleId: replaced.id,
        action: "cancel",
        reservation: {
          startTime: { gt: now },
          date: {
            gte: toDbDate(piece.startsOn)!,
            ...(piece.endsOn != null ? { lte: toDbDate(piece.endsOn)! } : {}),
          },
        },
      },
      select: { id: true, reservation: { select: { date: true } } },
    });
    found.push(...rows.map((r) => ({ id: r.id, date: r.reservation.date })));
  }
  if (found.length === 0) return null;
  const from = found.reduce((a, b) => (b.date < a ? b.date : a), found[0]!.date);
  return {
    ruleId: replaced.id,
    outcomeIds: found.map((f) => f.id),
    from: from.toISOString().slice(0, 10),
  };
}
