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
  type AcmmMetrics,
} from "../data/ai-health.js";
import styles from "./AiHealthPage.module.css";

const PLACEHOLDER = "—";

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

export function AiHealthPage() {
  const {
    data: report,
    isLoading,
    error,
  } = useQuery<SensorReport>({
    queryKey: ["sensorReport"],
    queryFn: ({ signal }) => fetchSensorReport(signal),
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
      </section>

      <section className={styles.section}>
        <Heading level={2}>Domain Activity</Heading>
        <DomainActivityPanel domainActivity={metrics.domainActivity} />
      </section>

      <section className={styles.section}>
        <Heading level={2}>ACMM Maturity</Heading>
        <AcmmPanel acmm={metrics.acmm} />
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
