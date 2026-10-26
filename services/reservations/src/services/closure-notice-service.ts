import { serviceDayInstant } from "@mbe/availability";
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

/**
 * When the closure begins: its first service date plus its window's start
 * (a whole-day closure begins at the service day's start), in venue time.
 * `null` when that wall time does not exist (a DST gap).
 */
export function closureStartsAt(w: ClosureWindow): Date | null {
  return serviceDayInstant(w.startsOn, w.from ?? 0, w.timezone);
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
 * hours is urgent. An unknown start (missing rule, DST gap) errs toward urgent,
 * so the guest gets every channel they have.
 */
async function isUrgent(store: Store, input: EnqueueInput): Promise<boolean> {
  const w = await store.loadClosureWindow(input.venueId, input.ruleId);
  const startsAt = w ? closureStartsAt(w) : null;
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
    /** The per-closure urgency decision, for callers that enqueue single outcomes. */
    isUrgent: (input: EnqueueInput) => isUrgent(store, input),
    callList: (venueId: string, ruleId: string) => store.listCallList(venueId, ruleId),
    summaries: (venueId: string) => store.listSummaries(venueId),
  };
}

export type ClosureNoticeService = ReturnType<typeof createClosureNoticeService>;
