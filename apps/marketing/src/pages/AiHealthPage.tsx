import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Badge, Heading, Text, Spinner, Alert } from "@mattbutlerengineering/rialto";
import {
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatRatio,
  formatTimestamp,
  isReportStale,
} from "../utils/formatters.js";
import {
  normalizeSensorReport,
  type SensorReport,
  type QueueEfficiencyMetrics,
  type DomainActivityMetrics,
  type ReviewBurdenMetrics,
  type AcmmMetrics,
} from "../data/ai-health.js";
import { normalizeHealthTrends } from "../data/ai-health-trends.js";
import { TrendChart } from "../components/TrendChart.js";
import styles from "./AiHealthPage.module.css";

const PLACEHOLDER = "—";

/** ACMM's own level range, so the axis shows absolute progress, not just the data's spread. */
const ACMM_MIN_LEVEL = 0;
const ACMM_MAX_LEVEL = 6;
/** The composite is a 0–1 score. */
const COMPOSITE_MIN = 0;
const COMPOSITE_MAX = 1;

const formatLevel = (value: number) => String(value);
const formatComposite = (value: number) => value.toFixed(2);

function formatCount(value: number | null): string {
  return value == null ? PLACEHOLDER : String(value);
}

function formatUsd(value: number | null): string {
  return value == null ? PLACEHOLDER : `$${value.toFixed(2)}`;
}

function formatHours(value: number | null): string {
  return value == null ? PLACEHOLDER : `${value}h`;
}

function QueueEfficiencyPanel({ queueEfficiency }: { queueEfficiency: QueueEfficiencyMetrics }) {
  if (!queueEfficiency.available) {
    return (
      <div className={styles.sensorGrid}>
        <div className={styles.sensorRow}>
          <Text className={styles.sensorName}>queueEfficiency</Text>
          <div className={styles.sensorBadge}>
            <Badge color="red" size="sm">
              Unavailable
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.statGrid}>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Composite Score</Text>
          <Text className={styles.statValue}>
            {queueEfficiency.composite == null ? PLACEHOLDER : queueEfficiency.composite.toFixed(2)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>First-Pass Success</Text>
          <Text className={styles.statValue}>
            {queueEfficiency.firstPassSuccessRate == null
              ? PLACEHOLDER
              : formatRatio(queueEfficiency.firstPassSuccessRate)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Cost / Issue</Text>
          <Text className={styles.statValue}>{formatUsd(queueEfficiency.costPerIssue)}</Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Time to Merge</Text>
          <Text className={styles.statValue}>
            {formatHours(queueEfficiency.medianTimeToMergeHours)}
          </Text>
        </Card>
      </div>
      {queueEfficiency.distribution.length > 0 && (
        <div className={styles.sensorGrid}>
          {queueEfficiency.distribution.map(([tier, count]) => (
            <div key={tier} className={styles.sensorRow}>
              <Text className={styles.sensorName}>{tier}</Text>
              <Text>{count}</Text>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DomainActivityPanel({ domainActivity }: { domainActivity: DomainActivityMetrics }) {
  if (!domainActivity.available) {
    return (
      <div className={styles.sensorGrid} data-testid="domain-activity-panel">
        <div className={styles.sensorRow}>
          <Text className={styles.sensorName}>domainActivity</Text>
          <div className={styles.sensorBadge}>
            <Badge color="red" size="sm">
              Unavailable
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="domain-activity-panel">
      <div className={styles.statGrid}>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Reservations Created</Text>
          <Text className={styles.statValue} data-testid="reservations-created">
            {formatCount(domainActivity.reservationsCreated)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Reservations Cancelled</Text>
          <Text className={styles.statValue} data-testid="reservations-cancelled">
            {formatCount(domainActivity.reservationsCancelled)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Reservations Completed</Text>
          <Text className={styles.statValue} data-testid="reservations-completed">
            {formatCount(domainActivity.reservationsCompleted)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Reservations No-Show</Text>
          <Text className={styles.statValue} data-testid="reservations-no-show">
            {formatCount(domainActivity.reservationsNoShow)}
          </Text>
        </Card>
      </div>
      <div className={styles.statGrid}>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Deposits Held</Text>
          <Text className={styles.statValue} data-testid="deposits-held">
            {formatCount(domainActivity.depositsHeld)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Deposits Applied</Text>
          <Text className={styles.statValue} data-testid="deposits-applied">
            {formatCount(domainActivity.depositsApplied)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Deposits Refunded</Text>
          <Text className={styles.statValue} data-testid="deposits-refunded">
            {formatCount(domainActivity.depositsRefunded)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Deposits Forfeited</Text>
          <Text className={styles.statValue} data-testid="deposits-forfeited">
            {formatCount(domainActivity.depositsForfeited)}
          </Text>
        </Card>
      </div>
    </div>
  );
}

function ReviewBurdenPanel({ reviewBurden }: { reviewBurden: ReviewBurdenMetrics }) {
  if (!reviewBurden.available) {
    return (
      <div className={styles.sensorGrid} data-testid="review-burden-panel">
        <div className={styles.sensorRow}>
          <Text className={styles.sensorName}>reviewBurden</Text>
          <div className={styles.sensorBadge}>
            <Badge color="red" size="sm">
              Unavailable
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="review-burden-panel">
      <div className={styles.statGrid}>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Reviewers</Text>
          <Text className={styles.statValue}>{formatCount(reviewBurden.totalReviewers)}</Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Reviews</Text>
          <Text className={styles.statValue}>{formatCount(reviewBurden.totalReviews)}</Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Rubber-Stamped</Text>
          <Text className={styles.statValue}>
            {/* A structural zero has no ratio to report. Rendering 0.0% here
                would read as a passing score for a repo that has no formal
                review stage to score (#5619). The flag comes from the
                collector's own classification — never inferred from a zero. */}
            {reviewBurden.noFormalReviewStage || reviewBurden.rubberStampRatio == null
              ? PLACEHOLDER
              : formatRatio(reviewBurden.rubberStampRatio)}
          </Text>
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Closed PRs</Text>
          <Text className={styles.statValue}>{formatCount(reviewBurden.totalClosedPrs)}</Text>
          <Text className={styles.statNote}>
            {reviewBurden.windowDays == null
              ? PLACEHOLDER
              : `${reviewBurden.windowDays}-day window`}
          </Text>
        </Card>
      </div>
      {reviewBurden.noFormalReviewStage && (
        <Text className={styles.panelNote} data-testid="review-burden-no-formal-stage">
          No formal review stage: all {formatCount(reviewBurden.totalClosedPrs)} sampled PRs merged
          on green CI with zero GitHub review submissions. There is no review burden to measure
          here, so the rubber-stamp ratio is not reported rather than shown as 0%.
        </Text>
      )}
    </div>
  );
}

function AcmmPanel({ acmm }: { acmm: AcmmMetrics }) {
  if (!acmm.available) {
    return (
      <div className={styles.sensorGrid}>
        <div className={styles.sensorRow}>
          <Text className={styles.sensorName}>acmm</Text>
          <div className={styles.sensorBadge}>
            <Badge color="red" size="sm">
              Unavailable
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.statGrid}>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Maturity Level</Text>
          <Text className={styles.statValue}>
            {acmm.level == null ? PLACEHOLDER : `Level ${acmm.level}`}
          </Text>
          {acmm.levelName && <Text className={styles.statNote}>{acmm.levelName}</Text>}
        </Card>
        <Card className={styles.statCard}>
          <Text className={styles.statLabel}>Criteria Detected</Text>
          <Text className={styles.statValue}>
            {acmm.criteriaMet == null || acmm.criteriaTotal == null
              ? PLACEHOLDER
              : `${acmm.criteriaMet}/${acmm.criteriaTotal}`}
          </Text>
        </Card>
      </div>
      {acmm.capped && acmm.failingGates.length > 0 && (
        <Alert
          variant="warning"
          title="Maturity level capped by a blocking gate"
          className={styles.staleBanner}
        >
          <ul>
            {acmm.failingGates.map((gate) => (
              <li key={gate.description}>{gate.description}</li>
            ))}
          </ul>
        </Alert>
      )}
    </>
  );
}

async function fetchSensorReport(signal: AbortSignal): Promise<SensorReport> {
  const response = await fetch("/sensor-report.json", { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as SensorReport;
}

/**
 * The trend series (#5443). Same mechanism as the snapshot report above — a
 * static JSON under `public/`, regenerated by the same `scripts/sensor-report.mjs`
 * run — so the two can never disagree about how current the page is. Returned
 * as `unknown`: `normalizeHealthTrends` is what decides its shape.
 */
async function fetchHealthTrends(signal: AbortSignal): Promise<unknown> {
  const response = await fetch("/ai-health-trends.json", { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as unknown;
}

/**
 * Both trend charts share one payload, so they share its loading and error
 * states. An absent payload is reported as absent rather than rendered as an
 * empty chart, which would read as "no history exists".
 */
function TrendSlot({
  phase,
  children,
}: {
  phase: "loading" | "error" | "ready";
  children: ReactNode;
}) {
  if (phase === "loading") {
    return <Text className={styles.statNote}>Loading trend history…</Text>;
  }
  if (phase === "error") {
    return <Text className={styles.statNote}>Trend history unavailable.</Text>;
  }
  return <>{children}</>;
}

export function AiHealthPage() {
  const {
    data: report,
    isLoading,
    error,
  } = useQuery<SensorReport>({
    queryKey: ["sensorReport"],
    queryFn: ({ signal }) => fetchSensorReport(signal),
  });

  const { data: trendsPayload, error: trendsError } = useQuery<unknown>({
    queryKey: ["aiHealthTrends"],
    queryFn: ({ signal }) => fetchHealthTrends(signal),
  });

  if (error) {
    return (
      <div className={styles.container}>
        <Heading level={1}>AI Health Dashboard</Heading>
        <Text className={styles.error}>Error loading sensor report: {error.message}</Text>
      </div>
    );
  }

  if (isLoading || !report) {
    return (
      <div className={styles.container}>
        <Heading level={1}>AI Health Dashboard</Heading>
        <div className={styles.loading}>
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  const metrics = normalizeSensorReport(report);
  const trends = normalizeHealthTrends(trendsPayload);
  const trendPhase = trendsError ? "error" : trendsPayload === undefined ? "loading" : "ready";

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>AI Health Dashboard</Heading>
        <Text className={styles.subtitle}>
          Live metrics for the AI agent system — sensors, CI, PRs, and issue pipeline
        </Text>
        <Text className={styles.meta}>
          As of {formatTimestamp(metrics.timestamp)}
          {" · "}
          <a href="/sensor-report.json" className={styles.jsonLink}>
            View raw JSON
          </a>
        </Text>
      </header>

      {isReportStale(report.generated_at) && (
        <Alert variant="warning" title="Data may be out of date" className={styles.staleBanner}>
          This report was generated more than 48 hours ago and may not reflect the current system
          state.
        </Alert>
      )}

      <section className={styles.section}>
        <Heading level={2}>Key Metrics</Heading>
        <div className={styles.statGrid}>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>CI Pass Rate</Text>
            <Text className={styles.statValue}>
              {metrics.ciPassRate == null ? PLACEHOLDER : formatPercent(metrics.ciPassRate)}
            </Text>
            <Text className={styles.statNote}>{formatCount(metrics.ciRecentRuns)} recent runs</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>PRs Merged (30d)</Text>
            <Text className={styles.statValue}>{formatCount(metrics.prsMerged)}</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>Issues Ready</Text>
            <Text className={styles.statValue}>{formatCount(metrics.issuesReady)}</Text>
            <Text className={styles.statNote}>{formatCount(metrics.issuesOpen)} open total</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>Sensors Active</Text>
            <Text className={styles.statValue}>
              {formatCount(metrics.sensorsAvailable)}/{formatCount(metrics.sensorsTotal)}
            </Text>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Queue Efficiency</Heading>
        <QueueEfficiencyPanel queueEfficiency={metrics.queueEfficiency} />
        <TrendSlot phase={trendPhase}>
          <TrendChart
            series={trends.queueEfficiency}
            min={COMPOSITE_MIN}
            max={COMPOSITE_MAX}
            formatValue={formatComposite}
            valueHeader="Composite"
            testId="queue-efficiency-trend"
          />
        </TrendSlot>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Domain Activity</Heading>
        <DomainActivityPanel domainActivity={metrics.domainActivity} />
      </section>

      <section className={styles.section}>
        <Heading level={2}>Review Burden</Heading>
        <ReviewBurdenPanel reviewBurden={metrics.reviewBurden} />
      </section>

      <section className={styles.section}>
        <Heading level={2}>ACMM Maturity</Heading>
        <AcmmPanel acmm={metrics.acmm} />
        <TrendSlot phase={trendPhase}>
          <TrendChart
            series={trends.acmmLevel}
            min={ACMM_MIN_LEVEL}
            max={ACMM_MAX_LEVEL}
            formatValue={formatLevel}
            valueHeader="Level"
            testId="acmm-level-trend"
          />
        </TrendSlot>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Sensor Status</Heading>
        <div className={styles.sensorGrid} data-testid="sensor-status-list">
          {metrics.sensorEntries.map(([key, sensor]) => (
            <div key={key} className={styles.sensorRow}>
              <Text className={styles.sensorName}>{key}</Text>
              <div className={styles.sensorBadge}>
                <Badge color={getSensorColor(sensor.available === true)} size="sm">
                  {formatSensorStatus(sensor.available === true)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      {metrics.regressionLabels.length > 0 && (
        <section className={styles.section}>
          <Heading level={2}>Active Regressions</Heading>
          <div className={styles.sensorGrid}>
            {metrics.regressionLabels.map((label) => (
              <div key={label} className={styles.sensorRow}>
                <Text>{label}</Text>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
