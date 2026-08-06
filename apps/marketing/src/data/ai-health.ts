/** Per-size-tier PR stats — `scripts/collect-queue-efficiency.mjs`'s `distribution` map. */
export interface QueueEfficiencyTierStats {
  readonly count: number;
  readonly avg_commits: number;
  readonly avg_ttm_hours: number;
}

/** Rolling 3-week baseline for the composite score — null until enough history exists. */
export interface QueueEfficiencyBaseline {
  readonly composite_median: number | null;
  readonly weeks_sampled: number;
  readonly fps_median: number | null;
  readonly ttm_median: number | null;
  readonly cost_per_issue_median: number | null;
}

/**
 * `queueEfficiency` sensor entry shape — see
 * `scripts/collect-queue-efficiency.mjs` (collector) and
 * `scripts/sensors-registry.mjs:717-764` (registry entry).
 */
export interface QueueEfficiencySensor {
  readonly available: boolean;
  readonly composite?: number;
  readonly sub_metrics?: {
    readonly issues_merged: number;
    readonly first_pass_success_rate: number;
    readonly median_time_to_merge_hours: number;
    readonly median_rework_cycles: number;
    readonly cost_per_issue_usd: number;
    readonly review_coverage: number | null;
  };
  readonly distribution?: Record<string, QueueEfficiencyTierStats>;
  readonly baseline?: QueueEfficiencyBaseline | null;
}

/**
 * `domainActivity` sensor entry shape — see
 * `scripts/collect-domain-metrics.mjs` (collector, appends one row per day
 * to the domain-metrics metric) and `scripts/sensors-registry.mjs:306-336`
 * (registry entry, reads the latest row). `date`/`venueId` are the window
 * metadata for that row; `available` is `false` whenever
 * `metrics/domain-metrics.jsonl` is missing or empty.
 */
export interface DomainActivitySensor {
  readonly available: boolean;
  readonly date?: string | null;
  readonly venueId?: string | null;
  readonly reservations_created?: number;
  readonly reservations_cancelled?: number;
  readonly reservations_completed?: number;
  readonly reservations_no_show?: number;
  readonly deposits_held?: number;
  readonly deposits_applied?: number;
  readonly deposits_refunded?: number;
  readonly deposits_forfeited?: number;
}

/**
 * Matches `buildReport()`'s output in `scripts/build-sensor-report.mjs`
 * exactly. `sensors` is a dynamic map keyed by each registry entry's
 * `reportKey` (or `id`) — only `queueEfficiency` and `domainActivity` are
 * typed here since they're the entries this page renders dedicated panels
 * for; every other entry is read defensively as `unknown` via
 * `normalizeSensorReport` below.
 */
export interface SensorReport {
  readonly generated_at: string;
  readonly period?: {
    readonly start: string;
    readonly end: string;
  };
  readonly sensors: Record<string, unknown> & {
    readonly queueEfficiency?: QueueEfficiencySensor;
    readonly domainActivity?: DomainActivitySensor;
  };
  readonly thresholds?: Record<string, number>;
  readonly regressions: readonly unknown[];
  readonly summary: {
    readonly sensors_available: number;
    readonly sensors_total: number;
    readonly regressions_detected: number;
    readonly status?: string;
  };
}

export {
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatTimestamp,
} from "../utils/formatters.js";

// --- Defensive normalization (#3659 follow-up) ---
//
// scripts/sensor-report.mjs (#3659) writes apps/marketing/public/sensor-report.json
// from a different report builder (scripts/build-sensor-report.mjs) whose
// field names don't match `SensorReport` above 1:1 (e.g. `ci` -> `ciHealth`,
// `timestamp` -> `generated_at`). #3660 is the tracked issue for migrating
// this page to that schema as its single source of truth. Until then,
// `normalizeSensorReport` reads whichever shape actually arrives — old
// `SensorReport`, the newer buildReport() shape, or a malformed/empty
// response — without ever throwing, so a schema mismatch degrades to a
// placeholder instead of crashing the page.

/** Safe view model for the queueEfficiency panel — null/empty fields when unavailable. */
export interface QueueEfficiencyMetrics {
  readonly available: boolean;
  readonly composite: number | null;
  readonly firstPassSuccessRate: number | null;
  readonly costPerIssue: number | null;
  readonly medianTimeToMergeHours: number | null;
  readonly distribution: ReadonlyArray<readonly [string, number]>;
}

/** Safe view model for the domainActivity panel — null fields when unavailable. */
export interface DomainActivityMetrics {
  readonly available: boolean;
  readonly date: string | null;
  readonly venueId: string | null;
  readonly reservationsCreated: number | null;
  readonly reservationsCancelled: number | null;
  readonly reservationsCompleted: number | null;
  readonly reservationsNoShow: number | null;
  readonly depositsHeld: number | null;
  readonly depositsApplied: number | null;
  readonly depositsRefunded: number | null;
  readonly depositsForfeited: number | null;
}

/** Safe view model for AiHealthPage — every field is null/empty on a miss. */
export interface HealthMetrics {
  readonly timestamp: string | null;
  readonly ciPassRate: number | null;
  readonly ciRecentRuns: number | null;
  readonly prsMerged: number | null;
  readonly issuesReady: number | null;
  readonly issuesOpen: number | null;
  readonly sensorsAvailable: number | null;
  readonly sensorsTotal: number | null;
  readonly sensorEntries: ReadonlyArray<readonly [string, Record<string, unknown>]>;
  readonly regressionLabels: readonly string[];
  readonly queueEfficiency: QueueEfficiencyMetrics;
  readonly domainActivity: DomainActivityMetrics;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function formatRegressionLabel(regression: unknown): string {
  if (typeof regression === "string") return regression;
  const r = asRecord(regression);
  const sensor = readString(r.sensor);
  const metric = readString(r.metric);
  return sensor && metric ? `${sensor}.${metric}` : JSON.stringify(regression);
}

/** Extracts the safe view model for the queueEfficiency panel from the raw sensor entry. */
function normalizeQueueEfficiency(sensors: Record<string, unknown>): QueueEfficiencyMetrics {
  const queueEfficiency = asRecord(sensors.queueEfficiency);
  const subMetrics = asRecord(queueEfficiency.sub_metrics);
  const distribution = asRecord(queueEfficiency.distribution);

  return {
    available: queueEfficiency.available === true,
    composite: readNumber(queueEfficiency.composite),
    firstPassSuccessRate: readNumber(subMetrics.first_pass_success_rate),
    costPerIssue: readNumber(subMetrics.cost_per_issue_usd),
    medianTimeToMergeHours: readNumber(subMetrics.median_time_to_merge_hours),
    distribution: Object.entries(distribution).map(
      ([tier, stats]) => [tier, readNumber(asRecord(stats).count) ?? 0] as const
    ),
  };
}

/** Extracts the safe view model for the domainActivity panel from the raw sensor entry. */
function normalizeDomainActivity(sensors: Record<string, unknown>): DomainActivityMetrics {
  const domainActivity = asRecord(sensors.domainActivity);

  return {
    available: domainActivity.available === true,
    date: readString(domainActivity.date),
    venueId: readString(domainActivity.venueId),
    reservationsCreated: readNumber(domainActivity.reservations_created),
    reservationsCancelled: readNumber(domainActivity.reservations_cancelled),
    reservationsCompleted: readNumber(domainActivity.reservations_completed),
    reservationsNoShow: readNumber(domainActivity.reservations_no_show),
    depositsHeld: readNumber(domainActivity.deposits_held),
    depositsApplied: readNumber(domainActivity.deposits_applied),
    depositsRefunded: readNumber(domainActivity.deposits_refunded),
    depositsForfeited: readNumber(domainActivity.deposits_forfeited),
  };
}

/** Normalizes a fetched sensor report (any shape) into safe display values. */
export function normalizeSensorReport(report: unknown): HealthMetrics {
  const raw = asRecord(report);
  const sensors = asRecord(raw.sensors);
  const summary = asRecord(raw.summary);
  const ci = asRecord(sensors.ci);
  const ciHealth = asRecord(sensors.ciHealth);
  const prMetrics = asRecord(sensors.prMetrics);
  const prMetricsLatest = asRecord(prMetrics.latest);
  const issues = asRecord(sensors.issues);
  const regressions = Array.isArray(raw.regressions) ? raw.regressions : [];

  return {
    timestamp: readString(raw.timestamp) ?? readString(raw.generated_at),
    ciPassRate: readNumber(ci.passRate) ?? readNumber(ciHealth.pass_rate_pct),
    ciRecentRuns: readNumber(ci.recentRuns) ?? readNumber(ciHealth.completed),
    prsMerged: readNumber(prMetrics.merged30d) ?? readNumber(prMetricsLatest.merged),
    issuesReady: readNumber(issues.ready) ?? readNumber(issues.queue_depth),
    issuesOpen: readNumber(issues.open),
    sensorsAvailable: readNumber(summary.available) ?? readNumber(summary.sensors_available),
    sensorsTotal: readNumber(summary.total) ?? readNumber(summary.sensors_total),
    sensorEntries: Object.entries(sensors).map(([key, value]) => [key, asRecord(value)] as const),
    regressionLabels: regressions.map(formatRegressionLabel),
    queueEfficiency: normalizeQueueEfficiency(sensors),
    domainActivity: normalizeDomainActivity(sensors),
  };
}
