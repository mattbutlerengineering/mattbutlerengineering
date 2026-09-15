/**
 * In-memory delivery-id dedup store for GitHub webhook redeliveries.
 *
 * GitHub redelivers a webhook whenever the initial delivery isn't
 * acknowledged within its 10s timeout (or answers non-2xx). Every delivery
 * carries a stable `x-github-delivery` UUID that stays IDENTICAL across
 * redeliveries of the same event — this store keys on that id so a replay is
 * a no-op instead of a second session/worktree/PR.
 *
 * State is owned by a `createDeliveryDedupStore()` factory instance, matching
 * `remediation-circuit-breaker.ts`'s pattern, so tests get a clean instance
 * without side-channelling a reset through the API.
 *
 * Store choice: in-memory, not persisted. Deliberate — GitHub's redeliveries
 * for a single event cluster within minutes to low hours of the original
 * attempt, well inside this store's 24h retention, so the dedup window is
 * covered without a Redis/DB dependency. Restart-safety tradeoff: a process
 * restart clears the set, so a delivery redelivered in that (rare,
 * operator-visible) window could duplicate one session — bounded, not
 * silent, and not worth a persisted store at current session volume. Revisit
 * if agent-service restarts become frequent enough to matter.
 */

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24h — covers GitHub's redelivery window

export interface DeliveryDedupStore {
  /**
   * Claims `id` for processing. Returns true the first time an id is seen
   * (caller should process the delivery) and false on any replay within the
   * retention window (caller must treat it as a no-op).
   */
  claim(id: string): boolean;
}

export function createDeliveryDedupStore(retentionMs = DEFAULT_RETENTION_MS): DeliveryDedupStore {
  const seenAt = new Map<string, number>();

  function prune(now: number): void {
    for (const [id, ts] of seenAt) {
      if (now - ts > retentionMs) seenAt.delete(id);
    }
  }

  return {
    claim(id: string): boolean {
      const now = Date.now();
      prune(now);
      if (seenAt.has(id)) return false;
      seenAt.set(id, now);
      return true;
    },
  };
}

/** Process-wide default instance. Route handlers share this. */
export const defaultDeliveryDedupStore: DeliveryDedupStore = createDeliveryDedupStore();
