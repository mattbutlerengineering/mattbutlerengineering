import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ClosurePostCommit, ReopenNotice } from "../services/closure-command.js";
import { loadClosureChanges } from "../services/closure-changes.js";

/**
 * Runs the work a saved closure or reopen owes after its transaction commits, exactly as the
 * command decided it (`ClosurePostCommit`, `ReopenNotice`), for `POST /closures`, its batch, a
 * Tonight close-early and a reopen alike. The save is already committed, so a queue outage must
 * not turn the answer into an error: each step logs its own failure and never blocks the next.
 * Refund outcomes stay `refund: pending` for `closureRefunds.retry`; guests with no confirmed
 * delivery are on the call list; the outcome sweeper re-enqueues what was lost (#7681).
 */

type NoticeEnqueue = FastifyInstance["services"]["closureNoticeService"]["enqueueForClosure"];

async function enqueueNotices(
  enqueue: NoticeEnqueue,
  input: Omit<Parameters<NoticeEnqueue>[0], "now">,
  log: FastifyBaseLogger,
  failure = "closure notices were not enqueued"
): Promise<void> {
  try {
    await enqueue({ ...input, now: new Date() });
  } catch (error) {
    log.error({ err: error, ...input }, failure);
  }
}

/**
 * Publishes the closure's cancels and moves exactly as the normal cancel and staff-move paths do
 * (`reservation:cancelled` / `reservation:updated`, reminders cancelled or re-timed), from the
 * committed rows, so nothing fires for a refused or rolled-back save. A replay re-publishes
 * current state, which is idempotent for clients and reminders.
 */
async function publishClosureChanges(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  plan: ClosurePostCommit
): Promise<void> {
  const { venueId, ruleId, carried } = plan;
  try {
    await fastify.transitions.settleClosure(
      venueId,
      await loadClosureChanges(venueId, ruleId, carried)
    );
  } catch (err) {
    log.error({ err, venueId, ruleId }, "closure SSE events were not published");
  }
}

export async function runClosurePostCommit(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  plan: ClosurePostCommit
): Promise<void> {
  const { venueId, ruleId, carried, givenBack } = plan;
  await publishClosureChanges(fastify, log, plan);
  if (plan.refunds) {
    try {
      await fastify.closureRefunds.enqueue(venueId, ruleId, carried);
    } catch (err) {
      log.error({ err, venueId, ruleId }, "Failed to enqueue closure refund jobs");
    }
  }
  const notices = fastify.services.closureNoticeService;
  await enqueueNotices(notices.enqueueForClosure, { venueId, ruleId, carried }, log);
  // An edit that gave dates back and chose to tell the guests there: the reopen notice, through
  // the same path a reopen uses, to the guests on the removed closure the save recorded.
  if (givenBack) {
    await enqueueNotices(
      notices.enqueueForReopen,
      { venueId, ruleId: givenBack.ruleId, only: givenBack.outcomeIds, date: givenBack.from },
      log,
      "given-back reopen notices were not enqueued"
    );
  }
}

export async function runReopenNotice(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  notice: ReopenNotice
): Promise<void> {
  await enqueueNotices(fastify.services.closureNoticeService.enqueueForReopen, notice, log);
}
