import type { FastifyBaseLogger, FastifyInstance } from "fastify";

/**
 * The work a saved closure owes after its transaction commits, shared by
 * `POST /closures` and a Tonight close-early so the two cannot drift. The save
 * is already committed, so a queue outage must not turn the answer into an
 * error: each enqueue logs its own failure and never blocks the other. Refund
 * outcomes stay `refund: pending` for `closureRefunds.retry`; guests with no
 * confirmed delivery are on the call list.
 */

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
