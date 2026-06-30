#!/usr/bin/env node
/**
 * worker-dispatch.mjs — decision seam for implement-queue worker dispatch.
 *
 * WHY THIS EXISTS — decoupling worker dispatch from the merge train:
 * Dispatching new implement-queue workers and running the merge train are
 * INDEPENDENT concerns. Worker dispatch must never wait on the merge-train
 * lock (`scripts/merge-train-lock.mjs`): a long merge train for one zone
 * should not stall picking up and implementing fresh `ready` issues.
 *
 * This module is the single source of truth for "may I dispatch more workers
 * right now?". It is gated ONLY by worker capacity (its own concern) and is
 * deliberately decoupled from — and never imports — the merge-train lock.
 *
 * Public API:
 *   canDispatchWorkers(opts?) → { allowed: boolean, reason: string }
 *   MAX_CONCURRENT_WORKERS    → number  (default dispatch ceiling)
 *
 * @module worker-dispatch
 */

// Default parallel-worker ceiling. Mirrors the "claim up to 3 independent
// ready issues" batch size in the implement-queue skill.
const MAX_CONCURRENT_WORKERS = 3;

/**
 * Decides whether the orchestrator may dispatch another implement-queue worker.
 *
 * Gated purely by worker capacity. It does NOT consult the merge-train lock,
 * so an in-flight merge train (held lock) never blocks new dispatch.
 *
 * @param {object} [opts]
 * @param {number} [opts.activeWorkers] — workers currently running (default: 0)
 * @param {number} [opts.maxWorkers]    — dispatch ceiling (default: MAX_CONCURRENT_WORKERS)
 * @returns {{ allowed: boolean, reason: string }}
 */
function canDispatchWorkers({ activeWorkers = 0, maxWorkers = MAX_CONCURRENT_WORKERS } = {}) {
  if (activeWorkers >= maxWorkers) {
    return { allowed: false, reason: "worker-capacity" };
  }
  return { allowed: true, reason: "ok" };
}

export { canDispatchWorkers, MAX_CONCURRENT_WORKERS };
