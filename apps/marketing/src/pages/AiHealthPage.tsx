import { useQuery } from "@tanstack/react-query";
import { Card, Badge, Heading, Text, Spinner } from "@mattbutlerengineering/rialto";
import {
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatTimestamp,
} from "../utils/formatters.js";
import { normalizeSensorReport, type SensorReport } from "../data/ai-health.js";
import styles from "./AiHealthPage.module.css";

const PLACEHOLDER = "—";

function formatCount(value: number | null): string {
  return value == null ? PLACEHOLDER : String(value);
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
          Last updated: {formatTimestamp(metrics.timestamp)}
          {" · "}
          <a href="/sensor-report.json" className={styles.jsonLink}>
            View raw JSON
          </a>
        </Text>
      </header>

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
        <Heading level={2}>Sensor Status</Heading>
        <div className={styles.sensorGrid}>
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
