/**
 * Rate limit monitoring — tracks hits and provides health check stats.
 *
 * Immutable design: each recorded event creates a new entry; reads return
 * frozen snapshots derived from the underlying log.
 */

/** A single rate-limit hit event (immutable record). */
export interface RateLimitHit {
  readonly ip: string;
  readonly endpoint: string;
  readonly timestamp: number;
}

/** Snapshot returned by getHealthCheckStats — safe to embed in /health. */
export interface RateLimitHealthStats {
  readonly hits_last_hour: number;
  readonly blocked_ips: number;
}

/** Full snapshot including the degraded flag. */
export interface RateLimitSnapshot {
  readonly stats: RateLimitHealthStats;
  readonly isDegraded: boolean;
}

/** Configuration for the rate-limit monitor. */
export interface RateLimitMonitorConfig {
  /** How far back (ms) the "last hour" window extends. Default: 3_600_000 */
  readonly hourWindowMs?: number;
  /** How far back (ms) the "degraded" window extends. Default: 300_000 (5 min) */
  readonly degradedWindowMs?: number;
  /** Threshold of hits within the degraded window to trigger degraded status. Default: 50 */
  readonly degradedThreshold?: number;
}

const DEFAULT_HOUR_WINDOW_MS = 3_600_000;
const DEFAULT_DEGRADED_WINDOW_MS = 300_000;
const DEFAULT_DEGRADED_THRESHOLD = 50;

export interface RateLimitMonitor {
  /** Record a rate-limit hit. */
  readonly recordHit: (ip: string, endpoint: string) => void;
  /** Get a frozen snapshot for health check reporting. */
  readonly getSnapshot: () => RateLimitSnapshot;
  /** Reset all recorded data (useful in tests). */
  readonly reset: () => void;
}

/**
 * Creates a rate-limit monitor instance.
 *
 * The monitor keeps an append-only log of rate-limit hits and derives stats
 * on read, pruning stale entries lazily.
 */
export function createRateLimitMonitor(config: RateLimitMonitorConfig = {}): RateLimitMonitor {
  const hourWindowMs = config.hourWindowMs ?? DEFAULT_HOUR_WINDOW_MS;
  const degradedWindowMs = config.degradedWindowMs ?? DEFAULT_DEGRADED_WINDOW_MS;
  const degradedThreshold = config.degradedThreshold ?? DEFAULT_DEGRADED_THRESHOLD;

  // Internal mutable log — never exposed directly.
  let hits: RateLimitHit[] = [];

  function prune(now: number): void {
    const cutoff = now - hourWindowMs;
    hits = hits.filter((h) => h.timestamp > cutoff);
  }

  function recordHit(ip: string, endpoint: string): void {
    const now = Date.now();
    hits = [...hits, { ip, endpoint, timestamp: now }];
    prune(now);
  }

  function getSnapshot(): RateLimitSnapshot {
    const now = Date.now();
    prune(now);

    const hitsLastHour = hits.length;

    const uniqueIps = new Set(hits.map((h) => h.ip));
    const blockedIps = uniqueIps.size;

    const degradedCutoff = now - degradedWindowMs;
    const recentHits = hits.filter((h) => h.timestamp > degradedCutoff).length;
    const isDegraded = recentHits > degradedThreshold;

    const stats: RateLimitHealthStats = Object.freeze({
      hits_last_hour: hitsLastHour,
      blocked_ips: blockedIps,
    });

    return Object.freeze({ stats, isDegraded });
  }

  function reset(): void {
    hits = [];
  }

  return Object.freeze({ recordHit, getSnapshot, reset });
}
