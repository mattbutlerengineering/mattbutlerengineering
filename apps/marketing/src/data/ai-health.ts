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
 * `reviewBurden` sensor entry shape — see `scripts/sensors-registry.mjs`'s
 * `reviewBurden` registry entry, which reads the newest row of the
 * review-burden metric (written by `scripts/acmm/review-burden-metrics.js`).
 * `available` is `false` whenever that file is missing or empty, which is
 * exactly the state #5530 exists to make visible rather than silent.
 */
export interface ReviewBurdenSensor {
  readonly available: boolean;
  readonly collected_at?: string | null;
  readonly window_days?: number | null;
  readonly total_closed_prs?: number;
  readonly total_reviewers?: number;
  readonly total_reviews?: number;
  readonly overall_rubber_stamp_ratio?: number;
  readonly overall_approvals?: number;
  readonly overall_rubber_stamps?: number;
  /**
   * Why the counts are what they are (#5619) — `"measured"`,
   * `"no-formal-review-stage"`, `"no-prs-sampled"`, or `"unknown"` for an
   * entry written before the collector recorded a reason.
   */
  readonly review_coverage?: string;
  readonly no_formal_review_stage?: boolean;
}

/** A single failing ACMM behavioral gate, per `state.computation.behavioralGates`. */
export interface AcmmFailingGate {
  readonly name: string;
  readonly description: string;
  readonly value: number | null;
  readonly threshold: number | null;
  readonly direction: string | null;
}

/**
 * `acmm` sensor entry shape — see `scripts/sensors-registry.mjs`'s `acmm`
 * registry entry `collect()`, which reads `.claude/acmm/state.json`.
 */
export interface AcmmSensor {
  readonly available: boolean;
  readonly level?: number | null;
  readonly level_name?: string | null;
  readonly criteria_met?: number;
  readonly criteria_total?: number;
  readonly last_run?: string | null;
  readonly capped?: boolean;
  readonly failing_gates?: readonly AcmmFailingGate[];
}

/**
 * Matches `buildReport()`'s output in `scripts/build-sensor-report.mjs`
 * exactly. `sensors` is a dynamic map keyed by each registry entry's
 * `reportKey` (or `id`) — only `queueEfficiency`, `reviewBurden`, and `acmm`
 * are typed here since they're the entries this page renders dedicated
 * panels for; every other entry is read defensively as `unknown` via
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
    readonly reviewBurden?: ReviewBurdenSensor;
    readonly acmm?: AcmmSensor;
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

/** Safe view model for the reviewBurden panel — null fields when unavailable. */
export interface ReviewBurdenMetrics {
  readonly available: boolean;
  readonly collectedAt: string | null;
  readonly windowDays: number | null;
  readonly totalClosedPrs: number | null;
  readonly totalReviewers: number | null;
  readonly totalReviews: number | null;
  readonly rubberStampRatio: number | null;
  /** See `ReviewBurdenSensor.review_coverage`. Null when the sensor is absent. */
  readonly reviewCoverage: string | null;
  /**
   * True only when the collector explicitly recorded that PRs were sampled and
   * none carried a formal review. Never inferred from zero counts — a zero of
   * unrecorded cause stays unclassified (#5619).
   */
  readonly noFormalReviewStage: boolean;
}

/** Safe view model for the acmm panel — null/empty fields when unavailable. */
export interface AcmmMetrics {
  readonly available: boolean;
  readonly level: number | null;
  readonly levelName: string | null;
  readonly criteriaMet: number | null;
  readonly criteriaTotal: number | null;
  readonly lastRun: string | null;
  readonly capped: boolean;
  readonly failingGates: ReadonlyArray<AcmmFailingGate>;
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
  readonly reviewBurden: ReviewBurdenMetrics;
  readonly acmm: AcmmMetrics;
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

/** Extracts the safe view model for the reviewBurden panel from the raw sensor entry. */
function normalizeReviewBurden(sensors: Record<string, unknown>): ReviewBurdenMetrics {
  const reviewBurden = asRecord(sensors.reviewBurden);

  return {
    available: reviewBurden.available === true,
    collectedAt: readString(reviewBurden.collected_at),
    windowDays: readNumber(reviewBurden.window_days),
    totalClosedPrs: readNumber(reviewBurden.total_closed_prs),
    totalReviewers: readNumber(reviewBurden.total_reviewers),
    totalReviews: readNumber(reviewBurden.total_reviews),
    rubberStampRatio: readNumber(reviewBurden.overall_rubber_stamp_ratio),
    reviewCoverage: readString(reviewBurden.review_coverage),
    noFormalReviewStage: reviewBurden.no_formal_review_stage === true,
  };
}

function normalizeFailingGate(gate: unknown): AcmmFailingGate {
  const g = asRecord(gate);
  return {
    name: readString(g.name) ?? "",
    description: readString(g.description) ?? "",
    value: readNumber(g.value),
    threshold: readNumber(g.threshold),
    direction: readString(g.direction),
  };
}

/** Extracts the safe view model for the acmm panel from the raw sensor entry. */
function normalizeAcmm(sensors: Record<string, unknown>): AcmmMetrics {
  const acmm = asRecord(sensors.acmm);
  const failingGates = Array.isArray(acmm.failing_gates) ? acmm.failing_gates : [];

  return {
    available: acmm.available === true,
    level: readNumber(acmm.level),
    levelName: readString(acmm.level_name),
    criteriaMet: readNumber(acmm.criteria_met),
    criteriaTotal: readNumber(acmm.criteria_total),
    lastRun: readString(acmm.last_run),
    capped: acmm.capped === true,
    failingGates: failingGates.map(normalizeFailingGate),
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
    reviewBurden: normalizeReviewBurden(sensors),
    acmm: normalizeAcmm(sensors),
  };
}
