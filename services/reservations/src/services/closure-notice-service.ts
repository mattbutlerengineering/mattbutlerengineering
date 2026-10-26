import { JOB_TYPES } from "../jobs/index.js";
import type { JobsPort } from "../transitions/ports.js";
import * as defaultStore from "./closure-notice-store.js";
import type { NoticeVariant } from "./closure-notice-store.js";

/** A closure is urgent for a booking that starts within this long (ux.md F5: 6 hours). */
export const URGENT_WINDOW_MS = 6 * 60 * 60 * 1000;

type Store = Pick<typeof defaultStore, "listNotifiable" | "listCallList">;
type Scheduler = Pick<JobsPort, "schedule">;

interface EnqueueInput {
  venueId: string;
  ruleId: string;
  now: Date;
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
    const suffix = variant === "reopened" ? ":reopened" : "";
    await Promise.all(
      outcomes.map((o) =>
        deps.scheduler.schedule(
          JOB_TYPES.CLOSURE_NOTICE,
          {
            outcomeId: o.outcomeId,
            venueId: input.venueId,
            variant,
            urgent: o.startTime.getTime() - input.now.getTime() <= URGENT_WINDOW_MS,
          },
          0,
          `closure-notice:${o.outcomeId}${suffix}`
        )
      )
    );
    return outcomes.length;
  }

  return {
    enqueueForClosure: (input: EnqueueInput) => enqueue("closure", input),
    enqueueForReopen: (input: EnqueueInput) => enqueue("reopened", input),
    callList: (venueId: string, ruleId: string) => store.listCallList(venueId, ruleId),
  };
}

export type ClosureNoticeService = ReturnType<typeof createClosureNoticeService>;
