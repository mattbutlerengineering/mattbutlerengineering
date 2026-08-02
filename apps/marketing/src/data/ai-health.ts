export interface AcmmSensor {
  readonly available: boolean;
  readonly level: string;
  readonly score: number;
  readonly gaps: number;
}

export interface CiSensor {
  readonly available: boolean;
  readonly passRate: number;
  readonly recentRuns: number;
}

export interface PrMetricsSensor {
  readonly available: boolean;
  readonly merged30d: number;
  readonly avgMergeTime?: string;
}

export interface IssuesSensor {
  readonly available: boolean;
  readonly open: number;
  readonly ready: number;
}

export interface LighthouseSensor {
  readonly available: boolean;
  readonly surfacesChecked: number;
  readonly surfacesTotal: number;
  readonly note?: string;
}

export interface SentrySensor {
  readonly available: boolean;
  readonly totalIssues: number;
  readonly errorCount: number;
  readonly note?: string;
}

export interface AgentCostSensor {
  readonly available: boolean;
  readonly sessions: number;
  readonly note?: string;
}

export interface SensorReport {
  readonly timestamp: string;
  readonly sensors: {
    readonly acmm: AcmmSensor;
    readonly ci: CiSensor;
    readonly prMetrics: PrMetricsSensor;
    readonly issues: IssuesSensor;
    readonly lighthouse: LighthouseSensor;
    readonly sentry: SentrySensor;
    readonly agentCost: AgentCostSensor;
  };
  readonly regressions: readonly string[];
  readonly summary: {
    readonly available: number;
    readonly total: number;
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
  };
}
