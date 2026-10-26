import { firstOccurrenceOnOrAfter, localDateTimeOf, serviceDayInstant } from "@mbe/availability";
import { JOB_TYPES } from "../jobs/index.js";
import type { JobsPort } from "../transitions/ports.js";
import * as defaultStore from "./closure-notice-store.js";
import type { ClosureWindow, NoticeVariant } from "./closure-notice-store.js";

/** A closure that starts within this long is urgent (ux.md F5: 6 hours). */
export const URGENT_WINDOW_MS = 6 * 60 * 60 * 1000;

type Store = Pick<
  typeof defaultStore,
  "listNotifiable" | "listCallList" | "listSummaries" | "loadClosureWindow"
>;
type Scheduler = Pick<JobsPort, "schedule">;

interface EnqueueInput {
  venueId: string;
  ruleId: string;
  now: Date;
}

/** The closure's earliest covered service date on or after today in venue time, or `null` when none is left. */
function nextClosureDate(w: ClosureWindow, now: Date): string | null {
  return firstOccurrenceOnOrAfter(
    {
      startsOn: w.startsOn,
      endsOn: w.endsOn,
      repeat: w.weekdays == null ? null : { weekdays: w.weekdays },
    },
    localDateTimeOf(now, w.timezone).date
  );
}

/**
 * When the closure next begins: the next occurrence of the rule (so a rule that
 * started in the past, or repeats, is judged from today) plus its window's
 * start, in venue time. `null` when that wall time does not exist (a DST gap)
 * or no occurrence is left.
 */
export function closureStartsAt(w: ClosureWindow, now: Date): Date | null {
  const date = nextClosureDate(w, now);
  return date === null ? null : serviceDayInstant(date, w.from ?? 0, w.timezone);
}

/**
 * BullMQ rejects a custom id containing ':' unless it splits into exactly 3
 * parts (its legacy repeat-job form), so these ids use '_' only.
 */
export function closureNoticeJobId(outcomeId: string, variant: NoticeVariant): string {
  return variant === "reopened"
    ? `closure-notice_${outcomeId}_reopened`
    : `closure-notice_${outcomeId}`;
}

/**
 * Urgency is decided per closure, not per booking (architecture.md
 * § Closure notifications): every outcome of a closure starting within 6
 * hours is urgent. A missing rule or DST gap errs toward urgent, so the guest
 * gets every channel they have; a closure with no occurrence left has nothing
 * imminent to be urgent about.
 */
async function isUrgent(store: Store, input: EnqueueInput): Promise<boolean> {
  const w = await store.loadClosureWindow(input.venueId, input.ruleId);
  if (!w) return true;
  if (nextClosureDate(w, input.now) === null) return false;
  const startsAt = closureStartsAt(w, input.now);
  return startsAt === null || startsAt.getTime() - input.now.getTime() <= URGENT_WINDOW_MS;
}

/**
 * Enqueues CLOSURE_NOTICE jobs after a closure (or its reopening) commits.
 * One job per notifiable outcome, immediately, under a stable job id so a
 * replayed request enqueues nothing twice. Must run inside the venue's
 * context (the closure routes are `venueScoped`).
 */
export function createClosureNoticeService(deps: { scheduler: Scheduler; store?: Store }) {
  const store = deps.store ?? defaultStore;

  async function enqueue(variant: NoticeVariant, input: EnqueueInput): Promise<number> {
    const outcomes = await store.listNotifiable(input.venueId, input.ruleId, variant);
    if (outcomes.length === 0) return 0;
    const urgent = await isUrgent(store, input);
    await Promise.all(
      outcomes.map((o) =>
        deps.scheduler.schedule(
          JOB_TYPES.CLOSURE_NOTICE,
          {
            outcomeId: o.outcomeId,
            venueId: input.venueId,
            variant,
            urgent,
          },
          0,
          closureNoticeJobId(o.outcomeId, variant)
        )
      )
    );
    return outcomes.length;
  }

  return {
    enqueueForClosure: (input: EnqueueInput) => enqueue("closure", input),
    enqueueForReopen: (input: EnqueueInput) => enqueue("reopened", input),
    callList: (venueId: string, ruleId: string) => store.listCallList(venueId, ruleId),
    summaries: (venueId: string) => store.listSummaries(venueId),
  };
}

export type ClosureNoticeService = ReturnType<typeof createClosureNoticeService>;
