/**
 * QualityMetrics — Data model for AI loop quality metrics.
 *
 * Defines the shape of metrics consumed by the quality dashboard,
 * sourced from `metrics/acmm-pr-history.jsonl` and
 * `metrics/service-health.jsonl`.
 */

/** A single PR acceptance snapshot (one line from acmm-pr-history.jsonl). */
export interface PrAcceptanceEntry {
  readonly date: string;
  readonly windowDays: number;
  readonly total: number;
  readonly merged: number;
  readonly closed: number;
  readonly acceptanceRate: number;
  readonly agentMerged: number;
  readonly agentClosed: number;
  readonly agentMergeShare: number;
  readonly meanCloseHours: number;
}

/** Health status for a single service. */
export interface ServiceHealthEntry {
  readonly service: string;
  readonly status: "ok" | "degraded" | "down";
  readonly error_rates: number | null;
  readonly latency_ms: number | null;
}

/** A single service-health snapshot (one line from service-health.jsonl). */
export interface ServiceHealthSnapshot {
  readonly timestamp: string;
  readonly services: readonly ServiceHealthEntry[];
}

/** ACMM level badge metadata. */
export interface AcmmBadge {
  readonly level: number;
  readonly name: string;
  readonly passing: number;
  readonly total: number;
}

/** Aggregated metrics for the quality dashboard. */
export interface QualityDashboardData {
  readonly prAcceptance: readonly PrAcceptanceEntry[];
  readonly serviceHealth: readonly ServiceHealthSnapshot[];
  readonly acmm: AcmmBadge | null;
  readonly fetchedAt: string;
}

/** Default empty state for dashboard data. */
export function createEmptyDashboardData(): QualityDashboardData {
  return {
    prAcceptance: [],
    serviceHealth: [],
    acmm: null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Parse a JSONL string into an array of typed objects.
 * Skips blank lines and lines that fail to parse.
 */
export function parseJsonl<T>(raw: string): readonly T[] {
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .reduce<T[]>((acc, line) => {
      try {
        return [...acc, JSON.parse(line) as T];
      } catch {
        return acc;
      }
    }, []);
}
