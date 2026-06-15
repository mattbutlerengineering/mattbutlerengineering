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

export function formatSensorStatus(available: boolean): string {
  return available ? "Available" : "Unavailable";
}

export function getSensorColor(available: boolean): "green" | "red" {
  return available ? "green" : "red";
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}%` : `${rounded}%`;
}

export function formatTimestamp(value: string | null | undefined): string {
  if (value == null) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
