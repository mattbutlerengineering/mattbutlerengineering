import { useState, useEffect } from "react";
import { Card, Badge, Heading, Text, Spinner } from "@mattbutlerengineering/rialto";
import {
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatTimestamp,
  type SensorReport,
} from "../data/ai-health.js";
import styles from "./AiHealthPage.module.css";

export function AiHealthPage() {
  const [report, setReport] = useState<SensorReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/sensor-report.json");
        if (!response.ok) {
          throw new Error(`Failed to load sensor report: ${response.status}`);
        }
        const data: SensorReport = await response.json();
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.container}>
        <Heading level={1}>AI Health Dashboard</Heading>
        <Text className={styles.error}>Error loading sensor report: {error}</Text>
      </div>
    );
  }

  if (!report) {
    return (
      <div className={styles.container}>
        <Heading level={1}>AI Health Dashboard</Heading>
        <div className={styles.loading}>
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  const { sensors, summary } = report;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>AI Health Dashboard</Heading>
        <Text className={styles.subtitle}>
          Live metrics for the AI agent system — sensors, CI, PRs, and issue pipeline
        </Text>
        <Text className={styles.meta}>
          Last updated: {formatTimestamp(report.timestamp)}
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
            <Text className={styles.statValue}>{formatPercent(sensors.ci.passRate)}</Text>
            <Text className={styles.statNote}>{sensors.ci.recentRuns} recent runs</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>PRs Merged (30d)</Text>
            <Text className={styles.statValue}>{sensors.prMetrics.merged30d}</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>Issues Ready</Text>
            <Text className={styles.statValue}>{sensors.issues.ready}</Text>
            <Text className={styles.statNote}>{sensors.issues.open} open total</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>Sensors Active</Text>
            <Text className={styles.statValue}>
              {summary.available}/{summary.total}
            </Text>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Sensor Status</Heading>
        <div className={styles.sensorGrid}>
          {Object.entries(sensors).map(([key, sensor]) => (
            <div key={key} className={styles.sensorRow}>
              <Text className={styles.sensorName}>{key}</Text>
              <div className={styles.sensorBadge}>
                <Badge color={getSensorColor(sensor.available)} size="sm">
                  {formatSensorStatus(sensor.available)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      {report.regressions.length > 0 && (
        <section className={styles.section}>
          <Heading level={2}>Active Regressions</Heading>
          <div className={styles.sensorGrid}>
            {report.regressions.map((regression) => (
              <div key={regression} className={styles.sensorRow}>
                <Text>{regression}</Text>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
