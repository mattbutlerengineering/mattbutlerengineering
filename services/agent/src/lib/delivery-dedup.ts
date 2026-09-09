/**
 * In-memory delivery dedup for the GitHub webhook route (POST /v1/webhooks/github).
 *
 * Store: a process-local `Map<deliveryId, seenAtMs>` — NOT persisted to the
 * database or any external cache. Retention: entries older than
 * `RETENTION_MS` are evicted lazily on the next check/insert, so the map
 * self-bounds instead of growing forever.
 *
 * Why in-memory is acceptable here: GitHub's automatic redelivery for a
 * failed/timed-out delivery happens within minutes of the original attempt,
 * well inside `RETENTION_MS`. The residual risk is a service restart between
 * the original delivery and a later redelivery — the map is cleared, so that
 * redelivery would be treated as new and could create a second session.
 * That risk is accepted rather than backed by a persisted store because (a)
 * restarts are rare relative to the redelivery window, and (b) even in that
 * rare case the blast radius is bounded to one extra billable session by
 * `defaultConcurrency`'s cap and the merge-train review gate — not unbounded
 * duplication.
 */

const RETENTION_MS = 10 * 60 * 1000; // 10 minutes — covers GitHub's redelivery window

const seenDeliveries = new Map<string, number>();

function evictExpired(now: number): void {
  for (const [id, seenAtMs] of seenDeliveries) {
    if (now - seenAtMs > RETENTION_MS) {
      seenDeliveries.delete(id);
    }
  }
}

/**
 * Returns true if `deliveryId` was already processed within the retention
 * window (i.e. this is a redelivery that should be a no-op). Marks the id as
 * seen as a side effect, so a caller only needs to check this once per
 * delivery — no separate "mark processed" call.
 */
export function isDuplicateDelivery(deliveryId: string): boolean {
  const now = Date.now();
  evictExpired(now);

  if (seenDeliveries.has(deliveryId)) {
    return true;
  }

  seenDeliveries.set(deliveryId, now);
  return false;
}

export function __resetDeliveryDedupForTests(): void {
  seenDeliveries.clear();
}
