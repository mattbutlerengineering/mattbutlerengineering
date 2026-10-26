import type { FastifyBaseLogger } from "fastify";
import { JOB_TYPES } from "../jobs/index.js";
import type { JobScheduler } from "../jobs/index.js";
import { closureNoticeJobId, type ClosureNoticeService } from "./closure-notice-service.js";
import { closureRefundJobId } from "./closure-refund.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Re-enqueues closure refunds and notices lost after the closure committed
 * (#7681, review finding R6). `closure-post-commit.ts` only logs an enqueue
 * failure, so a process death, a Redis outage, a stalled or failed job, or an
 * old replica rejecting the job type leaves an outcome at `refund: pending`
 * or with no delivery recorded.
 *
 * The sweeper never settles anything itself and makes no Stripe call: it only
 * makes the existing jobs runnable again under the SAME stable job ids as the
 * original enqueue (`closureRefundJobId`, `closureNoticeJobId`). BullMQ treats
 * a retained failed or completed job as a duplicate, so the sweep goes through
 * `JobScheduler.requeue`, which removes a retained failed / completed job and
 * re-adds it under that id, and leaves a live (waiting / active / delayed) job
 * alone. Money safety does not depend on the job id: `settleClosureRefund`
 * skips `done` / `none`, the deposit CAS and the Stripe keys
 * (`${depositId}:refund`, `:closureRefund`) make a second run a no-op, and the
 * notice job skips channels already `sent`. Notices are requeued per STUCK
 * outcome only, never per closure, so a delivered sibling is never touched.
 *
 * Every read and enqueue for a venue runs inside `runWithVenueContext(venueId,
 * …)` (ADR-026); venues are enumerated through `getAllVenueIds`
 * (`app_cross_venue_venues()`). Each sweep takes at most `batchSize` outcomes
 * per kind per venue, oldest first.
 */

export const DEFAULT_GRACE_MS = 5 * 60 * 1000;
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_SWEEP_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 90_000;

export interface StuckOutcome {
  id: string;
  dateRuleId: string;
  reservationId: string;
}

export interface ClosureOutcomeSweepStore {
  /** `refund = pending`, last touched before `olderThan`. Venue-scoped; oldest first. */
  listStuckRefunds(venueId: string, olderThan: Date, limit: number): Promise<StuckOutcome[]>;
  /** Notifiable outcomes with no delivery recorded, created before `olderThan`. */
  listStuckNotices(venueId: string, olderThan: Date, limit: number): Promise<StuckOutcome[]>;
}

export interface ClosureOutcomeSweeperDeps {
  getVenueIds(): Promise<string[]>;
  store: ClosureOutcomeSweepStore;
  jobs: Pick<JobScheduler, "requeue">;
  notices: Pick<ClosureNoticeService, "isUrgent">;
  log: Pick<FastifyBaseLogger, "error" | "info">;
  now?: () => Date;
  graceMs?: number;
  batchSize?: number;
}

/** `requeued`: a runnable job was (re)created. `live`: one was already in the queue. */
export interface KindResult {
  requeued: number;
  live: number;
}

export interface SweepResult {
  refunds: KindResult;
  notices: KindResult;
}

const EMPTY: KindResult = { requeued: 0, live: 0 };

const add = (a: KindResult, b: KindResult): KindResult => ({
  requeued: a.requeued + b.requeued,
  live: a.live + b.live,
});

async function sweepRefunds(
  deps: ClosureOutcomeSweeperDeps,
  venueId: string,
  stuck: readonly StuckOutcome[]
): Promise<KindResult> {
  let result = EMPTY;
  for (const o of stuck) {
    try {
      const outcome = await deps.jobs.requeue(
        JOB_TYPES.CLOSURE_REFUND,
        { outcomeId: o.id, venueId },
        closureRefundJobId(o.dateRuleId, o.reservationId)
      );
      if (outcome === "live") {
        deps.log.info(
          { venueId, outcomeId: o.id },
          "closure sweeper: refund job still live in the queue"
        );
      }
      result = add(
        result,
        outcome === "live" ? { requeued: 0, live: 1 } : { requeued: 1, live: 0 }
      );
    } catch (err) {
      deps.log.error({ err, venueId, outcomeId: o.id }, "closure sweeper: refund requeue failed");
    }
  }
  return result;
}

async function sweepNotices(
  deps: ClosureOutcomeSweeperDeps,
  venueId: string,
  stuck: readonly StuckOutcome[],
  now: Date
): Promise<KindResult> {
  const urgencyByRule = new Map<string, boolean>();
  let result = EMPTY;
  for (const o of stuck) {
    try {
      let urgent = urgencyByRule.get(o.dateRuleId);
      if (urgent === undefined) {
        urgent = await deps.notices.isUrgent({ venueId, ruleId: o.dateRuleId, now });
        urgencyByRule.set(o.dateRuleId, urgent);
      }
      const outcome = await deps.jobs.requeue(
        JOB_TYPES.CLOSURE_NOTICE,
        { outcomeId: o.id, venueId, variant: "closure", urgent },
        closureNoticeJobId(o.id, "closure")
      );
      if (outcome === "live") {
        deps.log.info(
          { venueId, outcomeId: o.id },
          "closure sweeper: notice job still live in the queue"
        );
      }
      result = add(
        result,
        outcome === "live" ? { requeued: 0, live: 1 } : { requeued: 1, live: 0 }
      );
    } catch (err) {
      deps.log.error({ err, venueId, outcomeId: o.id }, "closure sweeper: notice requeue failed");
    }
  }
  return result;
}

async function sweepVenue(deps: ClosureOutcomeSweeperDeps, venueId: string): Promise<SweepResult> {
  const now = (deps.now ?? (() => new Date()))();
  const cutoff = new Date(now.getTime() - (deps.graceMs ?? DEFAULT_GRACE_MS));
  const limit = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  return runWithVenueContext(venueId, async () => {
    const refunds = await sweepRefunds(
      deps,
      venueId,
      await deps.store.listStuckRefunds(venueId, cutoff, limit)
    );
    const notices = await sweepNotices(
      deps,
      venueId,
      await deps.store.listStuckNotices(venueId, cutoff, limit),
      now
    );
    return { refunds, notices };
  });
}

/** One sweep over every venue. A failing venue is logged and does not stop the others. */
export async function sweepClosureOutcomes(deps: ClosureOutcomeSweeperDeps): Promise<SweepResult> {
  let total: SweepResult = { refunds: EMPTY, notices: EMPTY };
  for (const venueId of await deps.getVenueIds()) {
    try {
      const result = await sweepVenue(deps, venueId);
      total = {
        refunds: add(total.refunds, result.refunds),
        notices: add(total.notices, result.notices),
      };
    } catch (err) {
      deps.log.error({ err, venueId }, "closure sweeper: venue sweep failed");
    }
  }
  return total;
}

export interface ClosureOutcomeSweeper {
  start(): void;
  stop(): void;
}

/** Interval timer around `sweepClosureOutcomes`; a sweep never overlaps the previous one. */
export function createClosureOutcomeSweeper(
  deps: ClosureOutcomeSweeperDeps,
  opts: { intervalMs?: number; startupDelayMs?: number } = {}
): ClosureOutcomeSweeper {
  const { intervalMs = DEFAULT_SWEEP_INTERVAL_MS, startupDelayMs = DEFAULT_STARTUP_DELAY_MS } =
    opts;
  let startup: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await sweepClosureOutcomes(deps);
    } catch (err) {
      deps.log.error({ err }, "closure sweeper: sweep failed");
    } finally {
      running = false;
    }
  };

  return {
    start() {
      startup = setTimeout(() => {
        void tick();
        interval = setInterval(() => void tick(), intervalMs);
      }, startupDelayMs);
    },
    stop() {
      if (startup !== null) clearTimeout(startup);
      if (interval !== null) clearInterval(interval);
      startup = null;
      interval = null;
    },
  };
}
