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
