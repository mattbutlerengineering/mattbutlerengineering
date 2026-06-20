/**
 * SessionConcurrency — the single owner of the max-concurrent-sessions policy.
 *
 * Before this module the limit was parsed from `MAX_CONCURRENT_SESSIONS` in
 * three places (the create route, the session service's `triggerSession`, and
 * the session executor) and the active count was tracked separately in the
 * executor's controller map. Three modules co-owned one policy, so the
 * route-admit and monitor-release paths could read stale counts and
 * over-subscribe.
 *
 * This module owns BOTH the limit and the set of active session ids. `acquire`
 * is the only check-and-reserve operation; it runs synchronously, so a slot
 * freed by `release` (e.g. the liveness monitor cancelling a stale session) can
 * be re-used exactly once — never double-spent.
 */
export interface SessionConcurrency {
  /** The configured maximum number of concurrent sessions. */
  readonly limit: number;
  /** True when a new session could be admitted right now (no reservation). */
  canStart(): boolean;
  /**
   * Atomically reserve a slot for `sessionId`. Returns true if the slot was
   * granted (or already held by this id), false if at capacity. Idempotent for
   * an id that already holds a slot — never consumes a second slot.
   */
  acquire(sessionId: string): boolean;
  /** Release the slot held by `sessionId`. No-op if it holds none. */
  release(sessionId: string): void;
  /** Number of currently reserved slots. */
  activeCount(): number;
}

export function createSessionConcurrency(limit: number): SessionConcurrency {
  const active = new Set<string>();

  return {
    limit,
    canStart() {
      return active.size < limit;
    },
    acquire(sessionId: string) {
      if (active.has(sessionId)) return true;
      if (active.size >= limit) return false;
      active.add(sessionId);
      return true;
    },
    release(sessionId: string) {
      active.delete(sessionId);
    },
    activeCount() {
      return active.size;
    },
  };
}

/** Parse the concurrency limit from the environment. Single parse site. */
export function resolveConcurrencyLimit(): number {
  return parseInt(process.env.MAX_CONCURRENT_SESSIONS ?? "5", 10);
}

/**
 * The process-wide default gate. Built once from the environment at module
 * load. The route, the session service, and the session executor all share
 * THIS instance so the count is single-owned. The limit is parsed exactly here.
 */
export const defaultConcurrency: SessionConcurrency =
  createSessionConcurrency(resolveConcurrencyLimit());
