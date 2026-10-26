import type { FastifyBaseLogger } from "fastify";
import { JOB_TYPES } from "../jobs/index.js";
import type { JobsPort } from "../transitions/ports.js";
import type { ClosureNoticeService } from "./closure-notice-service.js";
import { closureRefundJobId } from "./closure-refund.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Re-enqueues closure refunds and notices lost after the closure committed
 * (#7681, review finding R6). `closure-post-commit.ts` only logs an enqueue
 * failure, so a process death, a Redis outage or a stalled job leaves an
 * outcome at `refund: pending` or with no delivery recorded.
 *
 * The sweeper never settles anything itself and makes no Stripe call: it only
 * schedules the existing jobs under the SAME stable job ids as the original
 * enqueue (`closureRefundJobId`, `closureNoticeJobId` via the notice service).
 * BullMQ ignores a second add of a live id, `settleClosureRefund` skips
 * `done` / `none`, and the notice job skips channels already `sent`, so a
 * sweep can never refund or notify twice.
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
  jobs: Pick<JobsPort, "schedule">;
  notices: Pick<ClosureNoticeService, "enqueueForClosure">;
  log: Pick<FastifyBaseLogger, "error">;
  now?: () => Date;
  graceMs?: number;
  batchSize?: number;
}

export interface SweepResult {
  refunds: number;
  notices: number;
}

async function sweepRefunds(
  deps: ClosureOutcomeSweeperDeps,
  venueId: string,
  stuck: readonly StuckOutcome[]
): Promise<number> {
  let enqueued = 0;
  for (const o of stuck) {
    try {
      await deps.jobs.schedule(
        JOB_TYPES.CLOSURE_REFUND,
        { outcomeId: o.id, venueId },
        0,
        closureRefundJobId(o.dateRuleId, o.reservationId)
      );
      enqueued += 1;
    } catch (err) {
      deps.log.error({ err, venueId, outcomeId: o.id }, "closure sweeper: refund enqueue failed");
    }
  }
  return enqueued;
}

async function sweepNotices(
  deps: ClosureOutcomeSweeperDeps,
  venueId: string,
  stuck: readonly StuckOutcome[],
  now: Date
): Promise<number> {
  const counts = new Map<string, number>();
  for (const o of stuck) counts.set(o.dateRuleId, (counts.get(o.dateRuleId) ?? 0) + 1);
  let enqueued = 0;
  for (const [ruleId, count] of counts) {
    try {
      await deps.notices.enqueueForClosure({ venueId, ruleId, now });
      enqueued += count;
    } catch (err) {
      deps.log.error({ err, venueId, ruleId }, "closure sweeper: notice enqueue failed");
    }
  }
  return enqueued;
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
  const total = { refunds: 0, notices: 0 };
  for (const venueId of await deps.getVenueIds()) {
    try {
      const result = await sweepVenue(deps, venueId);
      total.refunds += result.refunds;
      total.notices += result.notices;
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
