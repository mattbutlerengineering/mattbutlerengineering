import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { loadClosureChanges } from "../services/closure-changes.js";

/**
 * The work a saved closure owes after its transaction commits, shared by
 * `POST /closures` and a Tonight close-early so the two cannot drift. The save
 * is already committed, so a queue outage must not turn the answer into an
 * error: each enqueue logs its own failure and never blocks the other. Refund
 * outcomes stay `refund: pending` for `closureRefunds.retry`; guests with no
 * confirmed delivery are on the call list. Open timelines hear of each cancel and
 * move over SSE, and a moved booking's reminders are re-timed (`publishClosureChanges`).
 */

/**
 * Publishes the closure's cancels and moves exactly as the normal cancel and staff-move
 * paths do (`reservation:cancelled` / `reservation:updated`, reminders cancelled or
 * re-timed), from the committed rows, so nothing fires for a refused or rolled-back save.
 * A replay re-publishes current state, which is idempotent for clients and reminders.
 */
export async function publishClosureChanges(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  saved: { venueId: string; ruleId: string }
): Promise<void> {
  const { venueId, ruleId } = saved;
  try {
    await fastify.transitions.settleClosure(venueId, await loadClosureChanges(venueId, ruleId));
  } catch (err) {
    log.error({ err, venueId, ruleId }, "closure SSE events were not published");
  }
}

export async function enqueueNotices(
  enqueue: FastifyInstance["services"]["closureNoticeService"]["enqueueForClosure"],
  input: { venueId: string; ruleId: string },
  log: FastifyBaseLogger
): Promise<void> {
  try {
    await enqueue({ ...input, now: new Date() });
  } catch (error) {
    log.error({ err: error, ...input }, "closure notices were not enqueued");
  }
}

export async function enqueueClosureJobs(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  saved: { venueId: string; ruleId: string; cancelled: number }
): Promise<void> {
  const { venueId, ruleId, cancelled } = saved;
  await publishClosureChanges(fastify, log, { venueId, ruleId });
  if (cancelled > 0) {
    try {
      await fastify.closureRefunds.enqueue(venueId, ruleId);
    } catch (err) {
      log.error({ err, venueId, ruleId }, "Failed to enqueue closure refund jobs");
    }
  }
  await enqueueNotices(
    fastify.services.closureNoticeService.enqueueForClosure,
    { venueId, ruleId },
    log
  );
}
